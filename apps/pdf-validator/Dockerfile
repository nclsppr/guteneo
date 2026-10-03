# syntax=docker/dockerfile:1
FROM eclipse-temurin:21-jre-alpine@sha256:51ab5e3302e7141ce665ca3ea85e8b5cd648eafbc3c0c90dd79d6537684e4555 AS installer
RUN --mount=type=secret,id=proxy_ca \
    if [ -r /run/secrets/proxy_ca ]; then export SSL_CERT_FILE=/run/secrets/proxy_ca; fi; \
    apk add --no-cache curl unzip
ARG VERAPDF_VERSION=1.30.2
ARG VERAPDF_SHA256=6cc6341cb1af644044054b81f00a6590a7918abb18f762243de115258bcad838
COPY container/install.xml /tmp/install.xml
# The allowlisted version and checksum cannot be replaced by a build override.
RUN --mount=type=secret,id=proxy_ca \
    if [ -r /run/secrets/proxy_ca ]; then export CURL_CA_BUNDLE=/run/secrets/proxy_ca; fi; \
    test "$VERAPDF_VERSION" = "1.30.2" \
    && test "$VERAPDF_SHA256" = "6cc6341cb1af644044054b81f00a6590a7918abb18f762243de115258bcad838" \
    && curl --fail --silent --show-error --location --max-time 60 \
       "https://software.verapdf.org/releases/1.30/verapdf-greenfield-${VERAPDF_VERSION}-installer.zip" -o /tmp/installer.zip \
    && printf '%s  /tmp/installer.zip\n' "$VERAPDF_SHA256" | sha256sum -c - \
    && unzip -q /tmp/installer.zip -d /tmp/installer \
    && java -jar /tmp/installer/verapdf-greenfield-1.30.2/verapdf-izpack-installer-1.30.2.jar /tmp/install.xml \
    && rm -rf /opt/verapdf/Uninstaller /opt/verapdf/plugins

FROM eclipse-temurin:21-jre-alpine@sha256:51ab5e3302e7141ce665ca3ea85e8b5cd648eafbc3c0c90dd79d6537684e4555
RUN --mount=type=secret,id=proxy_ca \
    if [ -r /run/secrets/proxy_ca ]; then export SSL_CERT_FILE=/run/secrets/proxy_ca; fi; \
    apk add --no-cache python3 \
    && addgroup -S validator && adduser -S -G validator validator \
    && mkdir /app
COPY --from=installer /opt/verapdf /opt/verapdf
COPY container/server.py container/rules.json /app/
COPY licenses /app/licenses
# Source exports may carry a restrictive host umask. The unprivileged runtime
# must read its static code, profiles and notices; private PDFs remain mode 0600.
RUN chmod 0644 /app/server.py /app/rules.json \
    && chmod -R a+rX /app/licenses /opt/verapdf
ENV JAVA_OPTS="-Xms32m -Xmx384m -XX:ActiveProcessorCount=1 -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Djava.awt.headless=true"
USER validator
EXPOSE 8080
ENTRYPOINT ["python3", "-B", "/app/server.py"]
