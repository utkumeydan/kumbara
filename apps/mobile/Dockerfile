# Expo web derlemesi; API adresi derleme anında gömülür
FROM node:24-alpine AS build
WORKDIR /app
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
ARG EXPO_PUBLIC_SENTRY_DSN
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=$EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID EXPO_PUBLIC_SENTRY_DSN=$EXPO_PUBLIC_SENTRY_DSN
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx expo export -p web

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
