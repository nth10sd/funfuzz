# coding=utf-8
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""setuptools install script"""

from setuptools import find_packages
from setuptools import setup

EXTRAS = {
    "test": [
        "codecov==2.0.15",
        "coverage>=4.5.4,<4.6",
        "distro>=1.3.0",
        "flake8==3.7.9",
        "flake8-commas==2.0.0",
        "flake8-isort==2.8.0",
        "flake8-quotes>=2.1.1,<2.2",
        "isort==4.3.21",
        "pylint>=2.4.3,<2.5",
        "pytest>=5.3,<5.4",
        "pytest-cov>=2.8.1,<2.9",
        "pytest-flake8>=1.0.4,<1.1",
        "pytest-pylint>=0.14.0,<0.15",
    ]}


if __name__ == "__main__":
    setup(name="funfuzz",
          version="0.7.0a1",
          entry_points={
              "console_scripts": ["funfuzz = funfuzz.bot:main"],
          },
          package_data={"funfuzz": [
              "autobisectjs/*",
              "ccoverage/*",
              "js/*",
              "js/jsfunfuzz/*",
              "util/*",
          ]},
          package_dir={"": "src"},
          packages=find_packages(where="src"),
          install_requires=[
              "boto>=2.49.0",
              "fasteners>=0.15",
              # https://www.mercurial-scm.org/wiki/SupportedPythonVersions#Python_3.x_support
              # "mercurial>=4.7.2",  # Mercurial does not support Python 3 yet
              "requests>=2.20.1",
          ],
          extras_require=EXTRAS,
          python_requires=">=3.6",
          zip_safe=False)
