from setuptools import find_packages, setup
import subprocess
import re

def get_version():
    version = subprocess.check_output(['git', 'describe', '--tags', '--match', 'v[[:digit:]]*.[[:digit:]]*.[[:digit:]]*'], encoding='utf-8')
    version = version.strip()

    # if version string contains '-', it is not a tag. then, replace first - by +, others by .
    version = version.replace('-', '+', 1)
    version = version.replace('-', '.')

    # remove preceding 'v'
    if re.match('^v', version) is not None:
        version = version[1:]

    #sys.stderr.write(F'::INFO:: deriving version string "{version}" from "git describe"\n')

    return version

setup(
    name='lilypads',
    version=get_version(),
    packages=find_packages(),
    include_package_data=True,
    zip_safe=False,
    install_requires=[
        'flask',
        'flask_login',
        'passlib',
        'gunicorn',
        'Werkzeug'
    ],
)

