FROM golang:1.26-bookworm AS builder

ARG SPOTIFLAC_REF=02cfd119da4e5bf1b0f16ce7e8f38e503bdd995e
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/spotbye/SpotiFLAC.git /spotiflac && cd /spotiflac && git checkout "$SPOTIFLAC_REF"
WORKDIR /src
COPY services/spotiflac-importer/go.mod services/spotiflac-importer/main.go services/spotiflac-importer/main_test.go ./
RUN go mod tidy && go test ./... && CGO_ENABLED=1 go build -o /out/monochrome-spotiflac .

FROM ghcr.io/bartolomeorusso9/spotiflac-module-version@sha256:3d547abac134bdadc29f34f387f3e3b20b255a34bb068476f70f266c634b82ae
COPY --from=builder /out/monochrome-spotiflac /usr/local/bin/monochrome-spotiflac
COPY services/spotiflac-importer/entrypoint.sh /usr/local/bin/monochrome-spotiflac-entrypoint
RUN chmod 0755 /usr/local/bin/monochrome-spotiflac-entrypoint
ENV PORT=8787 POCKETBASE_URL=http://pocketbase:8090 MAX_IMPORT_BYTES=2147483648
EXPOSE 8787
ENTRYPOINT ["monochrome-spotiflac-entrypoint"]
