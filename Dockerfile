# Build stage: install everything and build the proxy and the UI.
FROM node:26-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY proxy/package.json proxy/
COPY ui/package.json ui/
# --ignore-scripts: skips the Husky `prepare` hook, which needs git.
RUN npm ci --ignore-scripts

COPY proxy proxy
COPY ui ui
RUN npm run build

# Runtime stage: the proxy has no runtime dependencies, so no node_modules.
FROM node:26-alpine
WORKDIR /app

ENV NODE_ENV=production \
	LLMSPY_HOST=0.0.0.0

# Same layout as the repo, so the proxy finds ../../ui/dist from proxy/dist.
COPY --from=build /app/proxy/package.json proxy/
COPY --from=build /app/proxy/dist proxy/dist
COPY --from=build /app/ui/dist ui/dist

USER node
# Made here, as node, so the compose volume mounted on it is node's to write.
RUN mkdir /home/node/.llmspy
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --start-interval=1s \
	CMD wget -qO- http://127.0.0.1:8080/ping > /dev/null || exit 1
CMD ["node", "proxy/dist/index.js"]
