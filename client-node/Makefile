
ifneq ($(CI), true)
LOCAL_ARG = --local --verbose --diagnostics
endif

run: build
	node dist/main.js

test:
	node_modules/.bin/jest --detectOpenHandles --colors --runInBand $(TESTARGS)

test-watch:
	node_modules/.bin/jest --detectOpenHandles --colors --runInBand --watch $(TESTARGS)

build-watch:
	./node_modules/.bin/tsc -p tsconfig.json --watch

build:
	./node_modules/.bin/tsc -p tsconfig.json

.PHONY: build test
