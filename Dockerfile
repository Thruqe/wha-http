FROM golang:latest AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -o wha-http .

FROM debian:bookworm-slim

ENV RPM_BIN=/usr/local/bin/rpm
ENV ZEVBOT_BIN=/usr/local/bin/zevBot

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget curl jq ca-certificates \
    && wget -O /usr/local/bin/rpm https://github.com/zevlion/rpm/releases/download/latest/rpm \
    && chmod +x /usr/local/bin/rpm \
    && wget -qO- https://github.com/zevlion/zevBot/releases/download/alpha/zevBot-linux-amd64.tar.gz | tar -xz -C /usr/local/bin/ \
    && chmod +x /usr/local/bin/zevBot \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/wha-http .

CMD ["./wha-http"]
