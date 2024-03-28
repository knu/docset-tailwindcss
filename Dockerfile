FROM ubuntu:jammy

RUN apt-get update && apt-get install --yes \
    rake \
    ruby-bundler \
    ruby-dev \
    racc \
    gcc \
    make \
    libyaml-dev

COPY . /stage
WORKDIR /stage

RUN bundle
ENTRYPOINT ["/bin/bash", "-c", "rake && cp *.docset output/"]
