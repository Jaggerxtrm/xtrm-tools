.PHONY: install build test ci clean

install:
	npm install
	cd cli && npm install

build:
	cd cli && npm run build

test:
	cd cli && npm test

ci: install build test
	@echo "✓ CI passed"

clean:
	rm -rf node_modules cli/node_modules cli/dist