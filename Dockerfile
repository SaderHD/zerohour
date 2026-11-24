FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/shared/package.json shared/
COPY --from=build /app/server/package.json server/
COPY --from=build /app/client/package.json client/
RUN npm ci --omit=dev -w server
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
EXPOSE 8080
USER node
CMD ["node", "server/dist/index.js"]
