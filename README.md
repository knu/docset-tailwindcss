Docset builder for Tailwind CSS
===============================

How to use
----------

    % bundle
    % rake

    % open Tailwind_CSS.docset

Or to build in Docker container:

    % docker build -t docset .
    % mkdir -p output
    # docker run -v`pwd`:/stage docset

Requirements
------------

- wget(1) - for recursively fetching the entire document tree

- convert(1), rsvg-convert(1) - for generating the icon

- tar(1) - bsdtar or GNU tar (I guess)

- [Dash.app](http://kapeli.com/dash) or any other compatible viewer

References
----------

- [GitHub Project](https://github.com/knu/docset-tailwindcss)

- [Tailwind CSS Documentation](https://tailwindcss.com/docs/)

- [Tailwind CSS Documentation Repository on GitHub](https://github.com/tailwindlabs/tailwindcss.com)

License
-------

This build script suite is:

Copyright (c) 2023 [Akinori MUSHA](https://akinori.org/)

Licensed under the 2-clause BSD license.
See `LICENSE` for details.

Generated docsets will be based on work by Tailwind Labs Inc.
Copyright (C) 2023 Tailwind Labs Inc.
