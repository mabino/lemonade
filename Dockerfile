# Runs the engine tests: docker build -t lemonade-test . && docker run --rm lemonade-test
FROM node:22-alpine
WORKDIR /app
COPY src/ src/
COPY test/ test/
CMD ["node", "test/test_engine.js"]
