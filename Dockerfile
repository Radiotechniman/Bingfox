FROM node:20-alpine

WORKDIR /app

# 1. Installeer git
RUN apk add --no-cache git

# 2. Clone de repository direct in de werkmap (/app)
RUN git clone https://github.com/Radiotechniman/Bingfox.git .

RUN pwd && ls -la

# 3. Installeer dependencies
RUN npm install --production

# 4. Frontend dependencies installeren en compileren naar dist
RUN cd frontend && npm install && npm run build

# Maak een data map en link data.db naar die map
RUN mkdir -p /app/data && ln -s /app/data/data.db /app/data.db

# 5. Open de gewenste poort (pas aan naar wens)
EXPOSE 3001

# 6. Start de applicatie
CMD ["node", "server.js"]