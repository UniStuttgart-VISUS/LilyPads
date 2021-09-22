import gzip
import json

class Dataset:
    def __init__(self, fsentry):
        with gzip.open(fsentry.path, 'rt') as f:
            docs = json.load(f)
            self.roles = docs['metadata']['roles']

            d = dict()
            for doc in docs['articles']:
                d[doc['Index']] = doc

            self.key = fsentry.name.replace('.gz', '')
            self.content = docs
            self.articles = d
            self.geolocations = docs['geolocations']
            self.name = docs['metadata']['name']
            self.length = len(d)

    def allowed(self, user_roles):
        return type(user_roles) is list \
                and any(map(lambda role: role in user_roles, self.roles))
