FROM golang:latest AS go-builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -o whatsrook .

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

RUN wget -qO- https://github.com/Thruqe/whatsrook/releases/download/v3.1.0/whatsrook-linux-amd64.tar.gz \
    | tar -xz -C /usr/local/bin/ \
    && chmod +x /usr/local/bin/whatsrook

WORKDIR /app
COPY --from=go-builder /app/whatsrook .
# Static client — served directly by the Go binary, no build step needed
COPY client/ ./client/

ENV WHATSROOK_BIN=/usr/local/bin/whatsrook
ENV PORT=8080

EXPOSE 8080
ENTRYPOINT ["./whatsrook"]