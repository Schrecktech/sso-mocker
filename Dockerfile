FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN addgroup -g 1001 mocker && adduser -u 1001 -G mocker -s /bin/sh -D mocker

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/config ./config
COPY --from=build /app/bin ./bin

USER mocker
EXPOSE 9090

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:9090/health || exit 1

ENTRYPOINT ["node", "bin/sso-mocker.js", "start"]
CMD ["--env", "integration"]
