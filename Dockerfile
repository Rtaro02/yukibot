FROM ubuntu:latest

RUN apt-get update
RUN apt-get install -y dnsutils curl wget iproute2
RUN curl -fsSL https://deb.nodesource.com/setup_21.x | bash - && apt install -y nodejs
WORKDIR /yukibot
COPY . /yukibot
RUN npm install

ENTRYPOINT ["node"]
CMD ["main.js"]
