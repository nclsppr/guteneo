"""Real TCP ordering tests with synthetic engine results, not PDF qualification."""

from contextlib import contextmanager
import http.client
import importlib.util
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "response_admission_server", Path(__file__).parent.parent / "container/server.py",
)
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
SMALL = b"%PDF-synthetic"
LARGE = SMALL + b" " * (server.MAX_BYTES - len(SMALL))


def result(data, profile):
    return {"profile": profile, "bytes": len(data)}


def request(port, method="POST", path="/validate?profile=ua1", body=SMALL):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        connection.request(method, path, body if method == "POST" else None,
                           {"Content-Type": "application/pdf"} if method == "POST" else {})
        response = connection.getresponse()
        return response.status, json.loads(response.read())
    finally:
        connection.close()


@contextmanager
def serving(handler=server.Handler, engine=result):
    with patch.object(server, "ENGINE_READY", True), \
            patch.object(server, "SHUTDOWN_REQUESTED", False), \
            patch.object(server, "validate_bytes", side_effect=engine) as validation:
        httpd = server.PrivateServer(("127.0.0.1", 0), handler)
        listener = threading.Thread(target=httpd.serve_forever, kwargs={"poll_interval": 0.01})
        listener.start()
        try:
            yield httpd.server_address[1], validation
        finally:
            httpd.shutdown()
            httpd.server_close()
            listener.join(timeout=5)
            if listener.is_alive() or server.VALIDATION_LOCK.locked():
                raise AssertionError("TCP test did not clean up its server and admission lock")


class ResponseAdmissionTests(unittest.TestCase):
    def sequential_after_published_response(self, first_method, first_path):
        published = threading.Event()
        release = threading.Event()
        observed = []

        class BarrierHandler(server.Handler):
            def send_json(self, status, payload):
                if self.path == first_path:
                    observed.append(server.VALIDATION_LOCK.locked())
                super().send_json(status, payload)
                if self.path == first_path:
                    published.set()
                    if not release.wait(5):
                        raise AssertionError("TCP response publication barrier timed out")

        with serving(BarrierHandler) as (port, validation):
            try:
                first = request(port, first_method, first_path)
                self.assertEqual(first[0], 200)
                self.assertTrue(published.wait(5))
                self.assertEqual(observed, [False])
                # The first handler still has not returned. A complete response
                # nevertheless means its validation and cleanup have finished.
                self.assertEqual(request(port, path="/validate?profile=ua2", body=LARGE),
                                 (200, {"profile": "ua2", "bytes": server.MAX_BYTES}))
                self.assertEqual(validation.call_count, 2 if first_method == "POST" else 1)
            finally:
                release.set()

    def test_sequential_large_post_is_admitted_after_complete_validation_response(self):
        self.sequential_after_published_response("POST", "/validate?profile=ua1")

    def test_sequential_large_post_is_admitted_after_process_deadline_response(self):
        with patch.dict(server.os.environ, {"QUALIFICATION_ENABLED": "true"}), \
                patch.object(server, "bounded_process", side_effect=server.ValidationError("VALIDATION_TIMEOUT")):
            self.sequential_after_published_response("GET", "/qualification/process-deadline")

    def test_real_engine_overlap_remains_busy_without_second_engine_call(self):
        entered = threading.Event()
        release = threading.Event()
        completed = []

        def blocked_engine(data, profile):
            self.assertTrue(server.VALIDATION_LOCK.locked())
            entered.set()
            if not release.wait(5):
                raise AssertionError("Synthetic engine overlap barrier timed out")
            return result(data, profile)

        with serving(engine=blocked_engine) as (port, validation):
            first = threading.Thread(target=lambda: completed.append(request(port)))
            first.start()
            try:
                self.assertTrue(entered.wait(5))
                self.assertEqual(request(port, path="/validate?profile=ua2"),
                                 (503, {"code": "VALIDATOR_BUSY"}))
                self.assertEqual(validation.call_count, 1)
            finally:
                release.set()
                first.join(timeout=5)
            self.assertFalse(first.is_alive())
            self.assertEqual(completed, [(200, result(SMALL, "ua1"))])

    def test_terminal_validation_errors_and_shutdown_publish_after_release(self):
        cases = [
            (server.ValidationError("INVALID_PDF"), False, 400, "INVALID_PDF"),
            (server.ValidationError("VALIDATOR_UNAVAILABLE"), False, 503, "VALIDATOR_UNAVAILABLE"),
            (server.ValidationError("VALIDATION_TIMEOUT"), False, 503, "VALIDATION_TIMEOUT"),
            (server.ValidationError("VALIDATION_INCOMPLETE"), False, 503, "VALIDATION_INCOMPLETE"),
            (server.ValidationError("untrusted"), False, 503, "VALIDATION_INCOMPLETE"),
            (TimeoutError(), False, 503, "VALIDATION_TIMEOUT"),
            (ConnectionError(), False, 503, "VALIDATION_TIMEOUT"),
            (ValueError(), False, 503, "VALIDATION_INCOMPLETE"),
            (None, True, 503, "VALIDATOR_UNAVAILABLE"),
        ]
        for error, shutdown, status, code in cases:
            with self.subTest(error=error, shutdown=shutdown):
                observed = []

                class ObservedHandler(server.Handler):
                    def send_json(self, response_status, payload):
                        observed.append(server.VALIDATION_LOCK.locked())
                        super().send_json(response_status, payload)

                def failed_engine(_data, _profile):
                    self.assertTrue(server.VALIDATION_LOCK.locked())
                    raise error

                with serving(ObservedHandler, failed_engine) as (port, validation):
                    with patch.object(server, "SHUTDOWN_REQUESTED", shutdown):
                        self.assertEqual(request(port), (status, {"code": code}))
                    self.assertEqual(observed, [False])
                    self.assertEqual(validation.call_count, 0 if shutdown else 1)

    def test_incomplete_process_deadline_results_publish_after_release(self):
        for failure in (None, server.ValidationError("VALIDATOR_UNAVAILABLE")):
            with self.subTest(failure=failure):
                observed = []

                class ObservedHandler(server.Handler):
                    def send_json(self, status, payload):
                        observed.append(server.VALIDATION_LOCK.locked())
                        super().send_json(status, payload)

                with serving(ObservedHandler) as (port, _validation), \
                        patch.dict(server.os.environ, {"QUALIFICATION_ENABLED": "true"}), \
                        patch.object(server, "bounded_process", side_effect=failure):
                    self.assertEqual(request(port, "GET", "/qualification/process-deadline"),
                                     (503, {"code": "VALIDATION_INCOMPLETE"}))
                    self.assertEqual(observed, [False])

    def test_response_write_failure_never_attempts_a_second_response(self):
        attempted = []

        class DisconnectedHandler(server.Handler):
            def send_json(self, status, payload):
                attempted.append((status, server.VALIDATION_LOCK.locked()))
                raise BrokenPipeError("Synthetic disconnected response transport")

        with serving(DisconnectedHandler) as (port, validation):
            with self.assertRaises(http.client.RemoteDisconnected):
                request(port)
            self.assertEqual(attempted, [(200, False)])
            self.assertEqual(validation.call_count, 1)


if __name__ == "__main__":
    unittest.main()
