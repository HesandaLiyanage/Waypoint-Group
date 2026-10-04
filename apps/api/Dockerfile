# Build stage
FROM golang:alpine AS builder

WORKDIR /app

# Copy module definitions
COPY apps/api/go.mod apps/api/go.sum* ./
RUN go mod download

# Copy source code
COPY apps/api/ ./

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /bin/waypoint-api ./cmd/server

# Final runtime image
FROM alpine:3.20

RUN apk --no-cache add ca-certificates tzdata
ENV TZ=Asia/Colombo

WORKDIR /app
RUN mkdir -p /app/data/photos
COPY db/seed/data /app/db/seed/data
COPY --from=builder /bin/waypoint-api /usr/local/bin/waypoint-api

EXPOSE 8080

CMD ["waypoint-api"]
