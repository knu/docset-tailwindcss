# frozen_string_literal: true
require 'bundler/setup'
Bundler.require

require 'digest'
require 'json'
require 'pathname'
require 'set'
require 'tempfile'
require 'time'
require 'uri'
require 'zlib'
require 'rubygems/version'

def jenkins?
  /jenkins-/.match?(ENV['BUILD_TAG'])
end

def paginate_command(cmd, diff: false)
  case cmd
  when Array
    cmd = cmd.shelljoin
  end

  if $stdout.tty? || (diff && jenkins?)
    pager = (ENV['DIFF_PAGER'] if diff) || ENV['PAGER'] || 'more'
    "#{cmd} | #{pager}"
  else
    cmd
  end
end

def read_table(table, &)
  header = table.xpath('.//tr[1]')
  columns = header.xpath('.//th').map { |th|
    th.xpath("normalize-space(.)").tr('-A-Z ', '_a-z_').to_sym
  }

  # colspan has to be expanded; e.g. https://tailwindcss.com/docs/container#class-table
  trs = table.xpath('.//tr[./td]')
  matrix = trs.map { |tr| tr.xpath('.//td').to_a }
  expanded = Set[]
  matrix.each_with_index do |cells, row|
    cells.each_with_index do |cell, col|
      if expanded.add?(cell) && rowspan = cell['rowspan']&.to_i
        (row + 1...row + rowspan).each do |row|
          matrix[row].insert(col, cell)
        end
      end
    end
  end

  matrix.each_with_index do |cells, i|
    values = cells.map(&:text)
    yield columns.zip(values).to_h, trs[i]
  end

  nil
end

DOCSET_NAME = 'Tailwind CSS'
DOCSET = "#{DOCSET_NAME.tr(' ', '_')}.docset"
DOCSET_ARCHIVE = File.basename(DOCSET, '.docset') + '.tgz'
ROOT_RELPATH = 'Contents/Resources/Documents'
INDEX_RELPATH = 'Contents/Resources/docSet.dsidx'
DOCS_ROOT = File.join(DOCSET, ROOT_RELPATH)
DOCS_INDEX = File.join(DOCSET, INDEX_RELPATH)
DOCS_URI = URI('https://tailwindcss.com/docs/')
HOST_URI = DOCS_URI + '/'
DOCS_DIR = Pathname(DOCS_URI.host)
ICON_SITE_URI = URI('https://tailwindcss.com/brand')
ICON_FILE = Pathname('icon.png')
COMMON_CSS = Pathname('common.css')
COMMON_CSS_URL = DOCS_URI + COMMON_CSS.basename.to_s
FETCH_LOG = 'wget.log'
DUC_OWNER = 'knu'
DUC_REPO = "git@github.com:#{DUC_OWNER}/Dash-User-Contributions.git"
DUC_OWNER_UPSTREAM = 'Kapeli'
DUC_REPO_UPSTREAM = "https://github.com/#{DUC_OWNER_UPSTREAM}/Dash-User-Contributions.git"
DUC_WORKDIR = File.basename(DUC_REPO, '.git')
DUC_BRANCH = 'tailwindcss'

URI_ATTRS = [
  ['a', 'href'],
  ['img', 'src'],
  ['link', 'href'],
  ['script', 'src'],
]
FILE_SUFFIXES = [
  '',
  '.html'
]

class DocsetVersion < Data.define(:version, :build_id, :revision, :compare_key)
  include Comparable

  def self.parse(json)
    new(**JSON.parse(json, symbolize_names: true))
  end

  def self.load(path)
    parse(File.read(path))
  end

  def dump(path)
    File.open(path, "w") do |f|
      f.puts JSON.pretty_generate(self)
    end
  end

  def initialize(version:, build_id:, revision:)
    super(version:, build_id:, revision:, compare_key: [Gem::Version.new(version), revision])
  end

  def <=>(other)
    compare_key <=> other.compare_key
  end

  def to_json(...)
    {
      version: version,
      build_id: build_id,
      revision: revision,
    }.to_json(...)
  end

  def docset_version
    "#{version}-#{revision}"
  end
end

def all_versions
  Pathname.glob("versions/*/#{DOCSET}/version.json").map { |file|
    DocsetVersion.load(file)
  }.sort
end

def build_version_info
  doc = Nokogiri::HTML5(File.read("#{DOCS_DIR}/docs/index.html"))
  dl_version = Gem::Version.new(doc.at_css('.sticky.top-0').at_xpath('.//button[starts-with(., "v")]').text[/\Av\K\d[\d.]*/])
  dl_build_id = JSON.parse(doc.at("#__NEXT_DATA__").text)["buildId"] or raise 'buildId not found'

  revision = ENV['BUILD_REVISION']&.to_i ||
    case all_versions.take_while { |version_info| version_info.version <= dl_version }.max
    in nil
      0
    in { version:, build_id:, revision: }
      case
      when version < dl_version
        0
      when build_id == dl_build_id
        revision
      else
        revision + 1
      end
    else
      0
    end

  DocsetVersion.new(version: dl_version.to_s, build_id: dl_build_id, revision:)
end

def previous_version
  ENV['PREVIOUS_VERSION'] ||
    begin
      current_version_info = DocsetVersion.parse(File.read(File.join(built_docset, "version.json")))

      all_versions.reverse_each.find { |version_info|
        version_info < current_version_info
      }&.docset_version
    end
end

def previous_docset
  version = previous_version or raise 'No previous version found'

  "versions/#{version}/#{DOCSET}"
end

def built_docset
  if version = ENV['CURRENT_VERSION']
    "versions/#{version}/#{DOCSET}"
  else
    DOCSET
  end
end

def dump_index(docset, out)
  index = File.join(docset, INDEX_RELPATH)

  SQLite3::Database.new(index) do |db|
    db.execute("SELECT name, type, path FROM searchIndex ORDER BY name, type, path") do |row|
      out.puts row.join("\t")
    end
  end

  out.flush
end

desc "Fetch the #{DOCSET_NAME} document files."
task :fetch => %i[fetch:icon fetch:docs]

namespace :fetch do
  task :docs do
    puts 'Downloading %s' % DOCS_URI
    sh *%W[
      wget -nv --mirror --no-parent -p --append-output #{FETCH_LOG}
      --reject-regex=(/what_a_rush\\.png|/img/hero-pattern\\.svg)$
      #{DOCS_URI}
    ]

    Dir.glob("#{DOCS_DIR}/**/*") { |path|
      next unless File.file?(path)

      if !path.end_with?('.html') &&
          File.open(path) { |f| f.read(255).match?(/<!DOCTYPE html>/i) }
        path_with_suffix = path + '.html'
        if File.file?(path_with_suffix)
          rm path
        else
          mv path, path_with_suffix
        end
      end
    }
  end

  task :icon do
    Tempfile.create(['icon', '.svg']) do |temp|
      agent = Mechanize.new
      page = agent.get(ICON_SITE_URI)
      image = page.image_with(xpath: '//a[contains(., "Download mark") and @download]//img')
      image.fetch.save!(temp.path)
      # ImageMagick's SVG converter seems to produce different outputs
      # depending on the machine or build, so use rsvg-convert here.
      sh *%W[rsvg-convert -w 64 -o #{ICON_FILE} #{temp.path}]
      sh *%W[convert -background none -gravity center -extent 64x64 #{ICON_FILE} #{ICON_FILE}]
    rescue
      rm_f ICON_FILE
      raise
    end
  end
end

file DOCS_DIR do
  Rake::Task[:'fetch:docs'].invoke
end

file ICON_FILE do
  Rake::Task[:'fetch:icon'].invoke
end

desc 'Build a docset in the current directory.'
task :build => [DOCS_DIR, ICON_FILE] do |t|
  rm_rf [DOCSET, DOCSET_ARCHIVE]

  mkdir_p DOCS_ROOT

  cp 'Info.plist', File.join(DOCSET, 'Contents')
  cp ICON_FILE, DOCSET

  cp_r DOCS_DIR.to_s + '/.', DOCS_ROOT

  version_info = build_version_info
  version = version_info.docset_version
  build_id = version_info.build_id

  puts "Generating docset for #{DOCSET_NAME} #{version} (#{build_id})"

  version_info.dump(File.join(DOCSET, "version.json"))

  # Index
  db = SQLite3::Database.new(DOCS_INDEX)

  db.execute(<<-SQL)
    CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);
  SQL
  db.execute(<<-SQL)
    CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);
  SQL

  insert = db.prepare(<<-SQL)
    INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES (?, ?, ?);
  SQL

  index_item = ->(path, node, type, name) {
    id = '//apple_ref/cpp/%s/%s' % [type, name].map { |s|
      URI.encode_www_form_component(s).gsub('+', '%20')
    }
    a = Nokogiri::XML::Node.new('a', node.document).tap { |a|
      a['name'] = id
      a['class'] = 'dashAnchor'
    }
    a_parent =
      case node.name
      when 'table', 'tr'
        node.at_css('th, td')
      end || node

    if a_parent.at_xpath("./ancestor::table//th[contains(concat(' ', @class, ' '), ' sticky ')]")
      a.add_class('below-sticky-table-header')
    end

    a_parent.prepend_child(a)

    url = "#{path}\##{id}"
    insert.execute(name, type, url)
  }

  bad_hrefs = Set[]

  resolve_url = ->(href, uri) {
    begin
      case abs = uri + href
      when URI::HTTP
        # ok
      else
        return href
      end
    rescue URI::Error => e
      case href
      when /\Adata:/
        return href
      end
      p [:error, href]
      warn "#{e.message} in #{path}" if bad_hrefs.add?(href)
      return href
    end

    rel = HOST_URI.route_to(abs)
    if rel.host
      return abs
    end
    localpath = rel.path.chomp('/')
    FILE_SUFFIXES.each do |suffix|
      if File.file?(localpath + suffix)
        abs.path = abs.path.chomp('/') + suffix
        return uri.route_to(abs)
      end
    end

    abs
  }

  puts 'Indexing documents'

  cp COMMON_CSS, File.join(DOCS_ROOT, HOST_URI.route_to(DOCS_URI).to_s)

  cd DOCS_ROOT do
    sha1sums = {}

    Dir.glob("**/*.html", sort: true) { |path|
      sha1sum = Digest::SHA1.file(path).hexdigest
      if existent = sha1sums[sha1sum]
        ln_sf Pathname(existent).relative_path_from(File.dirname(path)), path
        next
      end
      sha1sums[sha1sum] = path

      uri = HOST_URI + path.chomp('.html')
      doc = Nokogiri::HTML5(File.read(path), path)

      doc.at_css('html').then do |html|
        html.remove_class(html.classes.grep(/(?:\A|:)\[--scroll-mt:/))

        html.prepend_child(Nokogiri::XML::Comment.new(doc, " Online page at #{uri} "))
      end

      doc.xpath('//meta[not(@charset or @name = "viewport")] | //script | //link[not(@rel="stylesheet")]').each(&:remove)

      URI_ATTRS.each do |tag, attr|
        doc.css("#{tag}[#{attr}]").each do |e|
          e[attr] = resolve_url.(e[attr], uri)
        end
      end

      doc.css('#__next > .top-0, footer + .fixed.bottom-0').each(&:remove)

      doc.css('.fixed > #nav').each do |nav|
        content = nav.parent.next_sibling
        nav.parent.remove
        content.remove_class(content.classes.grep(/(?:\A|:)?pl-/))
      end

      doc.at('head') << Nokogiri::XML::Node.new('link', doc).tap { |link|
        link['rel'] = 'stylesheet'
        link['href'] = uri.route_to(COMMON_CSS_URL)
      }

      doc.css('.absolute.hidden').each(&:remove) # anchors

      # Always show all classes
      if table = doc.at_css('#class-table')
        table.remove_class(%w[overflow-hidden])
        table.add_class(%w[overflow-auto])

        if (div = doc.at_css('.pointer-events-none.lg\\:hidden')) &&
            div.at_xpath('.//button[starts-with(normalize-space(.), "Show")]')
          div.remove
        end
      end

      doc.css('h1, h2, h3, h4, h5, h6').each do |h|
        index_item.(path, h, 'Section', h.xpath('normalize-space(.)'))
      end

      doc.xpath('//table[.//th]').each do |table|
        read_table(table) do |row, el|
          case row
          in { class: name, properties: }
            index_item.(path, el, 'Class', name)
            properties.scan(/^\s*(([^\s:]+):\s+[^\n]+);/) do |property, property_name|
              index_item.(path, el, 'Property', property_name)
              index_item.(path, el, 'Property', property)
            end
          in { class: name, left_to_right:, right_to_left: }
            # https://tailwindcss.com/docs/border-radius#using-logical-properties
            # covered by the main table
          in { class: name }
            # https://tailwindcss.com/docs/typography-plugin
            index_item.(path, el, 'Class', name[/\A\S+/])
          in { modifier:, media_query: }
            # covered by Pseudo-class reference
          in { modifier:, css: }
            index_item.(path, el, 'Modifier', "#{modifier}:")
            css.scan(/^\s*(([^\s:]+):\s+[^\n]+);/) do |property, property_name|
              index_item.(path, el, 'Property', property_name)
              index_item.(path, el, 'Property', property)
            end
          in { modifier:, target: }
            # https://tailwindcss.com/docs/typography-plugin
            modifier.sub!(/:\{utility\}\z/, '') or raise "#{path}: Unknown modifier with target: #{modifier}"
            index_item.(path, el, 'Modifier', "#{modifier}:")
          in { breakpoint_prefix:, css: }
            # covered by Pseudo-class reference
          in { modifier: }
            raise "Unsupported table: #{path}: #{row.inspect}"
          in { css: }
            raise "Unsupported table: #{path}: #{row.inspect}"
          else
            next
          end
        end
      end

      case File.basename(path)
      when 'functions-and-directives.html'
        type = nil
        doc.css('h2, h3').each do |el|
          case el.name
          when 'h2'
            case el.text.strip
            when 'Directives'
              type = 'Directive'
            when 'Functions'
              type = 'Function'
            end
          when 'h3'
            if type
              index_item.(path, el, type, el.text)
            end
          end
        end
      end

      File.write(path, doc.to_s)
    }

    Dir.glob("**/*.css") { |path|
      uri = HOST_URI + path

      File.write(
        path,
        File.read(path).gsub(%r{url\((['"]?)\K.*?(?=\1\))}) { |href|
          resolve_url.(href, uri)
        }
      )
    }
  end

  insert.close

  get_count = ->(**criteria) do
    db.get_first_value(<<-SQL, criteria.values)
      SELECT COUNT(*) from searchIndex where #{
        criteria.each_key.map { |column| "#{column} = ?" }.join(' and ')
      }
    SQL
  end

  assert_exists = ->(**criteria) do
    if get_count.(**criteria).zero?
      raise "#{criteria.inspect} not found in index!"
    end
  end

  puts 'Performing sanity check'

  {
    'Class' => [
      'container',
      'p-0.5',
      'pl-5',
      'space-x-0 > * + *',
      'prose-base',
    ],
    'Modifier' => [
      'sm:',
      'hover:',
      'prose-a:',
    ],
    'Property' => [
      'padding-left: 1.25rem',
      '--tw-ring-offset-width: 2px',
      'max-width: 768px',
      'transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1)',
      'transform: rotate(360deg)',
      'clip: rect(0, 0, 0, 0)', # sr-only
    ],
    'Function' => ['theme()', 'screen()'],
    'Directive' => ['@tailwind', '@apply'],
  }.each { |type, names|
    names.each { |name|
      assert_exists.(name: name, type: type)
    }
  }

  db.close

  sh 'tar', '-zcf', DOCSET_ARCHIVE, '--exclude=.DS_Store', DOCSET

  mkdir_p "versions/#{version}/#{DOCSET}"
  sh 'rsync', '-a', '--exclude=.DS_Store', '--delete', "#{DOCSET}/", "versions/#{version}/#{DOCSET}/"

  puts "Finished creating #{DOCSET} #{version} (#{build_id})"

  system paginate_command('rake diff:index', diff: true)
end

task :dump do
  system paginate_command('rake dump:index')
end

namespace :dump do
  desc 'Dump the index.'
  task :index do
    dump_index(built_docset, $stdout)
  end
end

task :diff do
  system paginate_command('rake diff:index diff:docs', diff: true)
end

namespace :diff do
  desc 'Show the differences in the index from an installed version.'
  task :index do
    Tempfile.create(['old', '.txt']) do |otxt|
      Tempfile.create(['new', '.txt']) do |ntxt|
        dump_index(previous_docset, otxt)
        otxt.close
        dump_index(built_docset, ntxt)
        ntxt.close

        puts "Diff in document indexes:"
        sh 'diff', '-U3', otxt.path, ntxt.path do
          # ignore status
        end
      end
    end
  end

  desc 'Show the differences in the docs from an installed version.'
  task :docs do
    old_root = File.join(previous_docset, ROOT_RELPATH)

    puts "Diff in document files:"
    sh 'diff', '-rNU3',
      '-x', '*.js',
      '-x', '*.css',
      '-x', '*.svg',
      old_root, DOCS_ROOT do
      # ignore status
    end
  end
end

file DUC_WORKDIR do |t|
  sh 'git', 'clone', DUC_REPO, t.name
  cd t.name do
    sh 'git', 'remote', 'add', 'upstream', DUC_REPO_UPSTREAM
    sh 'git', 'remote', 'update', 'upstream'
  end
end

desc 'Push the generated docset if there is an update'
task :push => DUC_WORKDIR do
  version_info = build_version_info
  version = version_info.docset_version
  workdir = Pathname(DUC_WORKDIR) / 'docsets' / File.basename(DOCSET, '.docset')

  docset_json = workdir / 'docset.json'
  archive = workdir / DOCSET_ARCHIVE
  versioned_archive = workdir / 'versions' / version / DOCSET_ARCHIVE

  puts "Resetting the working directory"
  cd workdir.to_s do
    sh 'git', 'remote', 'update'
    sh 'git', 'rev-parse', '--verify', '--quiet', DUC_BRANCH do |ok, |
      if ok
        sh 'git', 'checkout', DUC_BRANCH
        sh 'git', 'reset', '--hard', 'upstream/master'
      else
        sh 'git', 'checkout', '-b', DUC_BRANCH, 'upstream/master'
      end
    end
  end

  cp DOCSET_ARCHIVE, archive
  mkdir_p versioned_archive.dirname
  cp archive, versioned_archive

  specific_versions = nil

  puts "Updating #{docset_json}"
  File.open(docset_json, 'r+') { |f|
    json = JSON.parse(f.read)
    json['version'] = version
    specific_version = {
      'version' => version,
      'archive' => versioned_archive.relative_path_from(workdir).to_s
    }
    specific_versions = json['specific_versions'] = [specific_version] | json['specific_versions']
    f.rewind
    f.puts JSON.pretty_generate(json, indent: "    ")
    f.truncate(f.tell)
  }

  cd workdir.to_s do
    json_path = docset_json.relative_path_from(workdir).to_s

    if system(*%W[git diff --exit-code --quiet #{json_path}])
      puts "Nothing to commit."
      next
    end

    sh paginate_command(%W[git diff #{json_path}], diff: true)

    sh 'git', 'add', *[archive, versioned_archive, docset_json].map { |path|
      path.relative_path_from(workdir).to_s
    }
    sh 'git', 'commit', '-m', "Update #{DOCSET_NAME} docset to #{version}"
    sh 'git', 'push', '-fu', 'origin', "#{DUC_BRANCH}:#{DUC_BRANCH}"

    last_version = specific_versions.dig(1, 'version')
    puts "Diff to the latest version #{last_version}:"
    sh({ 'PREVIOUS_VERSION' => last_version }, paginate_command("rake diff:index", diff: true))

    puts "New docset is committed and pushed to #{DUC_OWNER}:#{DUC_BRANCH}.  To send a PR, go to the following URL:"
    puts "\t" + "#{DUC_REPO_UPSTREAM.delete_suffix(".git")}/compare/master...#{DUC_OWNER}:#{DUC_BRANCH}?expand=1"
  end
end

desc 'Send a pull-request'
task :pr => DUC_WORKDIR do
  cd DUC_WORKDIR do
    sh(*%W[git diff --exit-code --stat #{DUC_BRANCH}..upstream/master]) do |ok, _res|
      if ok
        puts "Nothing to send a pull-request for."
      else
        sh 'hub', 'pull-request', '-b', "#{DUC_OWNER_UPSTREAM}:master", '-h', "#{DUC_OWNER}:#{DUC_BRANCH}", '-m', `git log -1 --pretty=%s #{DUC_BRANCH}`.chomp
      end
    end
  end
end

desc 'Delete all fetched files and generated files'
task :clean do
  rm_rf [DOCS_DIR, ICON_FILE, DOCSET, DOCSET_ARCHIVE, FETCH_LOG]
end

task :default => :build
