#!/usr/bin/env python3

import sys
import json
import csv
import re
import os
import gzip
from functools import reduce
import argparse

is_number = re.compile('^\d+$')

stopwords_per_language = dict()
for language, short in (('German', 'de'), ('English', 'en'), ('French', 'fr'), ('Swedish', 'sv'), ('Finnish', 'fi'), ('Dutch', 'nl'), ('Spanish', 'es'), ('Welsh', 'cy'), ('Italian', 'it'), ('Polish', 'pl')):
    with open(F'stopwords/stopwords.{short}.txt') as f:
        stopwords = set()
        for line in f:
            stopwords.add(line.strip(' \n\r\f\t'))
        stopwords_per_language[language] = stopwords


def load_geolocations():
    geolocations = dict()
    entries = filter(lambda x: (x.path.endswith('.json') or x.path.endswith('.json.gz')) and x.is_file(),
                     os.scandir('geolocations.d/'))

    filecount = 0

    for entry in entries:
        if entry.path.endswith('.gz'):
            f = gzip.open(entry.path, mode='rt', encoding='utf-8')
        else:
            f = open(entry.path)

        j = json.load(f)
        f.close()

        geolocations.update(j)

        filecount += 1

    print(F'Loaded {len(geolocations)} geolocation entries from {filecount} files.')
    return geolocations


def stopword(word, language):
    return is_number.match(word) or word in stopwords_per_language[language]

def tokenize(text):
    noword = re.compile('[^\w-]')
    return list(
            map(lambda x: x.lower(),
                filter(lambda x: len(x),
                    map(lambda x: x.strip(),
                        noword.split(text)
                        )
                    )
                )
            )

def wordcount(text, language, extra_words):
    def add_to(dict_, word):
        # disallow only single-character tokens
        if reduce(lambda a, b: a and b, map(lambda x: len(x) < 2, word), True):
            return dict_
        if word in dict_:
            dict_[word] += 1
        else:
            dict_[word] = 1.0
        return dict_

    tokens = tokenize(text)
    whole_list = dict()
    token_penalties = dict()

    def add_ngrams(n, adder_, dict_, token_list):
        stopword_index = list(map(lambda x: stopword(x, language), token_list))
        for i in range(len(token_list)-n+1):
            stops = stopword_index[i:i+n]
            if stops[0] or stops[-1] or (n > 1 and len(list(filter(lambda x: x, stops))) >= n-1):
                continue
            word = tuple(token_list[i:i+n])
            adder_(dict_, word)

    add_ngrams(1, add_to, whole_list, tokens)
    add_ngrams(2, add_to, whole_list, tokens)
    add_ngrams(3, add_to, whole_list, tokens)

    amount = 2000
    as_tuples = list(whole_list.items())
    as_tuples.sort(key=lambda a: a[1], reverse=True)
    for k,v in as_tuples[:amount*2]:
        if len(k) > 1:
            for token in k:
                key = (token,)
                if key in token_penalties:
                    token_penalties[key] += 0.5
                else:
                    token_penalties[key] = 0.5

    as_tuples = list(whole_list.items())
    as_tuples.sort(key=lambda a: a[1] - (token_penalties[a[0]] if a[0] in token_penalties else 0), reverse=True)
    as_dict = dict()

    for k, v in as_tuples[:amount]:
        if v <= 0:
            continue
        as_dict[' '.join(list(k))] = [
                v,
                v - (token_penalties[k] if k in token_penalties else 0)
                ]
    for word in extra_words:
        if word in whole_list:
            if not word in as_dict:
                as_dict[word] = [
                        whole_list[word],
                        whole_list[word]
                        ]
    return as_dict

def run(dataset, metadata, out, geolocations, extra_words=[], json_args=dict(), wordcloud_field='Text'):
    data = []
    reader = csv.DictReader(dataset)
    g = dict()

    for row in reader:
        lang = row['Language']#.capitalize()
        if lang == 'Inglés':
            lang = 'English'
        if lang == 'Español':
            lang = 'Spanish'
        if lang == 'Francés':
            lang = 'French'
        row['Language'] = lang
        row['wordcounts'] = wordcount(row[wordcloud_field], 'English', extra_words)
        row['Index'] = int(row['Index'])
        del row['translated']
        data.append(row)

        # extract geolocations
        place_id = row['place_id']
        if place_id not in g:
            g[place_id] = geolocations[place_id]

    # load metadata
    meta = json.load(metadata)

    print(F'Loaded {len(data)} articles for dataset "{meta["name"]}".')

    complete_dataset = dict(articles=data, geolocations=g, metadata=meta)
    s = json.dumps(complete_dataset, **json_args)
    compressed = gzip.compress(s.encode('utf-8'), compresslevel=9)
    out.write(compressed)

extra_words = {
        'cs2_geolocated_translated.csv': ['kossuth']
        }

if __name__ == '__main__':
    parser = argparse.ArgumentParser('Convert a geolocated CSV to a LilyPads dataset')
    parser.add_argument('-d', '--debug', help='Output readable JSON',
            default=dict(separators=(',',':')),
            action='store_const',
            const=dict(indent=2))
    parser.add_argument('-w', '--wordcloud-field', help='CSV field to use for wordcloud generation',
            default='Text', choices=['Text', 'translated'])
    parser.add_argument('csv', help='Input CSV', type=argparse.FileType('r', encoding='utf-8'))
    parser.add_argument('metadata', help='Metadata JSON', type=argparse.FileType('r', encoding='utf-8'))
    parser.add_argument('dataset', help='Output GZIP\'ed JSON', type=argparse.FileType('wb'))

    parsed = parser.parse_args()

    if parsed.csv in extra_words:
        args = { "extra_words": extra_words[parsed.csv] }
    else:
        args = {}

    geolocations = load_geolocations()
    run(parsed.csv, parsed.metadata, parsed.dataset, geolocations, json_args=parsed.debug, wordcloud_field=parsed.wordcloud_field, **args)
