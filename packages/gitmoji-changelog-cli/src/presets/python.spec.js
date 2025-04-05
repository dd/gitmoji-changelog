const fs = require('fs')
const ChildProcess = require('child_process')

const loadProjectInfo = require('./python.js')

describe('getPackageInfo | python', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should extract metadata from a pyproject.toml made by poetry', async () =>{
    // Note the TOML section is distinct for poetry
    fs.readFileSync.mockReturnValue(`
      [tool.poetry]
      name = "poetry-package-name"
      version = "0.1.0"
      description = "Description of the poetry package"
    `)

    const result = await loadProjectInfo()

    expect(result).toEqual({
      name: 'poetry-package-name',
      version: '0.1.0',
      description: 'Description of the poetry package',
    })
  })

  it('should extract metadata from the PEP621 example pyproject.toml', async () =>{
    // [project] is the usual TOML section for the metadata
    fs.readFileSync.mockReturnValue(`
      [project]
      name = "spam"
      version = "2020.0.0"
      description = "Lovely Spam! Wonderful Spam!"
      readme = "README.rst"
      requires-python = ">=3.8"
      license = {file = "LICENSE.txt"}
      keywords = ["egg", "bacon", "sausage", "tomatoes", "Lobster Thermidor"]
      authors = [
        {email = "hi@pradyunsg.me"},
        {name = "Tzu-Ping Chung"}
      ]
      maintainers = [
        {name = "Brett Cannon", email = "brett@python.org"}
      ]
      classifiers = [
        "Development Status :: 4 - Beta",
        "Programming Language :: Python"
      ]

      dependencies = [
        "httpx",
        "gidgethub[httpx]>4.0.0",
        "django>2.1; os_name != 'nt'",
        "django>2.0; os_name == 'nt'"
      ]

      [project.optional-dependencies]
      test = [
        "pytest < 5.0.0",
        "pytest-cov[all]"
      ]

      [project.urls]
      homepage = "example.com"
      documentation = "readthedocs.org"
      repository = "github.com"
      changelog = "github.com/me/spam/blob/master/CHANGELOG.md"

      [project.scripts]
      spam-cli = "spam:main_cli"

      [project.gui-scripts]
      spam-gui = "spam:main_gui"

      [project.entry-points."spam.magical"]
      tomatoes = "spam:main_tomatoes"
    `)

    const result = await loadProjectInfo()

    expect(result).toEqual({
      name: 'spam',
      version: '2020.0.0',
      description: 'Lovely Spam! Wonderful Spam!',
    })
  })

  it('should extract metadata despite a missing description', async () =>{
    // The description metadata is optional.
    fs.readFileSync.mockReturnValue(`
      [project]
      name = "no-description"
      version = "0.0.1"
      readme = "README.rst"
    `)

    const result = await loadProjectInfo()

    expect(result).toEqual({
      name: 'no-description',
      version: '0.0.1',
      description: '',
    })
  })

  it('should use the first metadata value found from the top', async () =>{
    // Only the first occurance of the expected key names are taken.
    fs.readFileSync.mockReturnValue(`
      [other.section]
      somebody = "once told me the"
      world = "is gonna roll me"

      [project]
      name = "project-1"
      version = "0.0.1"
      description = "Project 1 Description"

      [tool.poetry]
      name = "project-2"
      version = "0.0.2"
      description = "Project 2 Description"

      [tool.something.else]
      name = "project-3"
      version = "0.0.3"
      description = "Project 3 Description"
    `)

    const result = await loadProjectInfo()

    expect(result).toEqual({
      name: 'project-1',
      version: '0.0.1',
      description: 'Project 1 Description',
    })
  })
})

describe('getPackageInfo | python | dynamic version', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should extract version from dynamic field for hatch', async () => {
    fs.readFileSync.mockReturnValue(`
      [build-system]
      build-backend = "hatchling.build"

      [project]
      name = "hatch-package-name"
      dynamic = ["version"]

      [tool.hatch.version]
      path = "src/__init__.py"
    `)
    jest.spyOn(ChildProcess, 'execSync').mockReturnValue('0.0.1\n')

    const result = await loadProjectInfo()

    expect(result.version).toEqual('0.0.1')
  })

  it('should extract version from dynamic field for flit', async () => {
    fs.readFileSync.mockReturnValue(`
      [build-system]
      build-backend = "flit_core.buildapi"

      [project]
      name = "flit-package-name"
      dynamic = ["version"]

      [tool.flit.module]
      name = "flit_package_name"
    `)
    jest.spyOn(ChildProcess, 'execSync').mockReturnValue(
      'Module: flit_package_name\nVersion: 0.2.3'
    )

    const result = await loadProjectInfo()

    expect(result.version).toEqual('0.2.3')
  })

  it('should extract version using setuptools_scm', async () => {
    fs.readFileSync.mockReturnValue(`
      [build-system]
      build-backend = "setuptools.build_meta"

      [project]
      name = "setuptools-package"
      dynamic = ["version"]

      [tool.setuptools_scm]
    `)
    jest.spyOn(ChildProcess, 'execSync').mockReturnValue('1.2.3\n')

    const result = await loadProjectInfo()

    expect(result.version).toEqual('1.2.3')
  })

  it('should extract version from dynamic field for pdm', async () => {
    fs.readFileSync.mockReturnValue(`
      [build-system]
      build-backend = "pdm.backend"

      [project]
      name = "pdm-package"
      dynamic = ["version"]

      [tool.pdm.version]
      source = "file"
    `)
    jest.spyOn(ChildProcess, 'execSync').mockReturnValue('3.4.5\n')

    const result = await loadProjectInfo()

    expect(result.version).toEqual('3.4.5')
  })
})

describe('getPackageInfo | python | dynamic description', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should extract description from README.md (string path)', async () => {
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath === 'pyproject.toml') {
        return `
          [project]
          name = "my-lib"
          version = "1.0.0"
          dynamic = ["description"]
          readme = "README.md"
        `
      }
      if (filePath === 'README.md') {
        return `
# My Awesome Library

This is a longer description.
        `
      }
      return ''
    })
    fs.existsSync.mockReturnValue(true)

    const result = await loadProjectInfo()
    expect(result.description).toBe('My Awesome Library')
  })

  it('should extract description from readme.file object path', async () => {
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath === 'pyproject.toml') {
        return `
          [project]
          name = "obj-readme"
          version = "1.0.0"
          dynamic = ["description"]

          [project.readme]
          file = "README.rst"
        `
      }
      if (filePath === 'README.rst') {
        return `
# Title from rst

More details follow...
        `
      }
      return ''
    })
    fs.existsSync.mockReturnValue(true)

    const result = await loadProjectInfo()
    expect(result.description).toBe('Title from rst')
  })

  it('should return empty description if README is empty', async () => {
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath === 'pyproject.toml') {
        return `
          [project]
          name = "empty-readme"
          version = "1.0.0"
          dynamic = ["description"]
          readme = "README.md"
        `
      }
      return ''
    })
    fs.existsSync.mockReturnValue(true)

    const result = await loadProjectInfo()
    expect(result.description).toBe('')
  })

  it('should fallback to empty description if README file not found', async () => {
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath === 'pyproject.toml') {
        return `
          [project]
          name = "no-readme"
          version = "1.0.0"
          dynamic = ["description"]
          readme = "README.md"
        `
      }
      return ''
    })
    fs.existsSync.mockReturnValue(false)

    const result = await loadProjectInfo()
    expect(result.description).toBe('')
  })
})

jest.mock('fs')
