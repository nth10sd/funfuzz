# coding=utf-8
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""Helper functions involving Git (git).
"""

import subprocess


def is_repo(repo_dir):
    """Checks if the given directory is a Git repository.

    Args:
        repo_dir (Path): Path to be checked

    Returns:
        bool: Returns True if the input path is a Git repository, otherwise False
    """
    try:
        return subprocess.run(["git", "-C", str(repo_dir), "rev-parse", "--is-inside-work-tree"],
                              check=True,
                              stdout=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        print("f{repo_dir} is not a Git repository")
        return False
