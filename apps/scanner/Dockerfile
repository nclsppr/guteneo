FROM clamav/clamav@sha256:9cb27d7660bdf66e9878c832cb433dd8aa152cfbe16f3c2c0084c80b04ae22b4

USER root
RUN apk add --no-cache python3 && mkdir -p /app /tmp/clamav && chown -R clamav:clamav /app /tmp/clamav
COPY container/clamd.conf /etc/clamav/clamd.conf
# Update signatures at image build time; runtime has no Internet access.
# A daily rebuild is required. Runtime refuses signatures older than 72 hours.
ARG SIGNATURE_REFRESH=2026-09-16
RUN test -n "$SIGNATURE_REFRESH" && freshclam --stdout
COPY --chown=clamav:clamav container/server.py /app/server.py
USER clamav
EXPOSE 8080
ENTRYPOINT ["python3", "-B", "/app/server.py"]
