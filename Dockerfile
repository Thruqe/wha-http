FROM node:24-slim AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:latest AS go-builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .

COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
RUN CGO_ENABLED=1 GOOS=linux go build -o wha-http .

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*


RUN wget -q -O /usr/local/bin/rpm \
    https://github.com/zevlion/rpm/releases/download/latest/rpm \
    && chmod +x /usr/local/bin/rpm \
    && wget -qO- https://github.com/zevlion/zevBot/releases/download/alpha/zevBot-linux-amd64.tar.gz \
    | tar -xz -C /usr/local/bin/ \
    && chmod +x /usr/local/bin/zevBot

WORKDIR /app
COPY --from=go-builder /app/wha-http .

ENV RPM_BIN=/usr/local/bin/rpm
ENV ZEVBOT_BIN=/usr/local/bin/zevBot
ENV PORT=8080

EXPOSE 8080
ENTRYPOINT ["./wha-http"]