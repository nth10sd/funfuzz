# coding=utf-8
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""Test the git_helpers.py file."""

import logging
from pathlib import Path

from funfuzz.util import git_helpers

FUNFUZZ_TEST_LOG = logging.getLogger("funfuzz_test")
logging.basicConfig(level=logging.DEBUG)
logging.getLogger("flake8").setLevel(logging.WARNING)


def test_is_repo():
    """Test that we are able to tell whether a given directory is a valid Git repository."""
    assert git_helpers.is_repo(Path(__file__).parent)
    assert not git_helpers.is_repo(Path.home() / "THIS_IS_NOT_VALID_DIR")
