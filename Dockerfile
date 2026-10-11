# Runs the tests: docker build -t lemonade-test . && docker run --rm lemonade-test
FROM node:22-alpine
WORKDIR /app
COPY src/ src/
COPY test/ test/
CMD ["sh", "-c", "node test/test_engine.js && node test/test_art.js && node --check src/lemonade.js"]
