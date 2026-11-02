FROM node:22-alpine AS rules
WORKDIR /app
COPY package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund
COPY tools/typescript.cjs tools/typescript.cjs
COPY assets/scripts assets/scripts
COPY server/build.cjs server/build.cjs
RUN node server/build.cjs

FROM node:16.20.2-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=7458
WORKDIR /app
COPY --from=rules --chown=node:node /app/server/dist ./server/dist
COPY --chown=node:node server/server.cjs server/access.cjs server/rooms.cjs server/voice.cjs server/healthcheck.cjs ./server/
COPY --chown=node:node server/release.json ./server/
COPY --chown=node:node server/test-admin.cjs server/hand-control.cjs ./server/
COPY --chown=node:node server/test-admin ./server/test-admin
COPY --chown=node:node build/web-repaired ./build/web-repaired
USER node
EXPOSE 7458
HEALTHCHECK --interval=30s --timeout=5s CMD ["node", "server/healthcheck.cjs"]
CMD ["node", "server/server.cjs"]
