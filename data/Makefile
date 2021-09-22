DATASETS := $(wildcard *.csv)
GZIPS := $(addprefix ../lilypads/data/,$(DATASETS:.csv=.gz))

.PHONY: all clean

all: $(GZIPS)

# $DEBUG_FLAGS is an environment variable that might be set from outside (for debug/dev builds)
# cs3 (Spanish-American War): use translated text for wordcloud as requested by Marc Priewe
../lilypads/data/%.gz: %.csv %.meta.json convert.py
	@echo "Create dataset $(basename $@)"
	@mkdir -p $(dir $@)
	@python3 ./convert.py $(DEBUG_FLAGS) \
		$$([[ "$<" = "cs3.csv" ]] && echo '--wordcloud-field translated ') \
		$< $(word 2,$^) $@

clean:
	@rm -vf $(GZIPS)
