FROM oven/bun:latest

ENV rpm=/usr/local/bin/rpm
ENV zevBot=/usr/local/bin/zevBot

WORKDIR /app

COPY . .

RUN apt-get update && apt-get install -y wget curl jq \
    && bun install \
    && wget -O /usr/local/bin/rpm https://github.com/zevlion/rpm/releases/download/latest/rpm \
    && chmod +x /usr/local/bin/rpm \
    && wget -qO- https://github.com/zevlion/zevBot/releases/download/alpha/zevBot-linux-amd64.tar.gz | tar -xz -C /usr/local/bin/ \
    && chmod +x /usr/local/bin/zevBot

RUN bun migrate
    
CMD ["bun", "start"]