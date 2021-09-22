.PHONY: all css@prod css@dev js@prod js@dev data@prod data@dev prod dev clean deploy

all: dev

dev: css@dev js@dev data@dev

prod: clean css@prod js@prod data@prod

css@prod:
	@sass \
		--no-source-map \
		--no-error-css \
		--charset \
		--stop-on-error \
		--style=compressed \
		src/scss/:lilypads/content/

css@dev:
	@sass \
		--source-map \
		--embed-source-map \
		--error-css \
		--charset \
		--no-stop-on-error \
		--style=expanded \
		src/scss/:lilypads/content/

js@prod:
	@npx webpack --mode production

js@dev:
	@npx webpack --mode development

data@prod:
	@(cd data/; DEBUG_FLAGS="" make)

data@dev:
	@(cd data/; DEBUG_FLAGS="-d" make)

clean:
	@rm -rvf \
		lilypads/data/* \
		lilypads/content/*.css \
		lilypads/dist/*

deploy:
	@./.deploy.sh
