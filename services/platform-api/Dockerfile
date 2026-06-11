FROM golang:1.26.4-bookworm AS builder

WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o /out/platform-api ./cmd/platform-api

FROM alpine:3.23

RUN apk add --no-cache ca-certificates
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app
COPY --from=builder --chown=app:app /out/platform-api /app/platform-api

USER app
EXPOSE 8080
ENTRYPOINT ["/app/platform-api"]
