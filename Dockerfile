FROM --platform=linux/amd64 alpine:latest

RUN apk update
RUN apk --no-cache add\
            chromium \
            nss \
            freetype \
            freetype-dev \
            harfbuzz \
            ca-certificates \
            ttf-freefont \
            nodejs \
            npm \
            curl

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /usr/app/yukibot
COPY . /usr/app/yukibot
RUN npm i

ENTRYPOINT [ "node" ]
CMD [ "./main.js" ]