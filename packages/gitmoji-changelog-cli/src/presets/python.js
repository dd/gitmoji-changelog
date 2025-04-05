const fs = require('fs')
const toml = require('smol-toml')
const ChildProcess = require('child_process')

module.exports = async () => {
  try {
    const pyproject = toml.parse(fs.readFileSync('pyproject.toml', 'utf-8'))
    const meta = pyproject.project || (pyproject.tool && pyproject.tool.poetry)
    const dynamicFields = meta.dynamic || []

    const name = meta.name
    if (!name) {
      throw new Error('Could not find name metadata in pyproject.toml')
    }

    let version = meta.version
    const isDynamicVersion = dynamicFields.includes('version')
    if (isDynamicVersion) {
      const backend = pyproject['build-system'] && pyproject['build-system']['build-backend']
      if (!backend) {
        throw new Error('Cannot resolve dynamic version: build-backend is not set')
      }

      switch (backend) {
        case 'hatchling.build':
          version = getHatchVersion()
          break

        case 'flit_core.buildapi':
          version = getFlitVersion()
          break

        case 'setuptools.build_meta':
          version = getSetuptoolsScmVersion()
          break

        case 'pdm.backend':
          version = getPdmVersion()
          break

        default:
          throw new Error(`Unsupported build-backend: ${backend}`)
      }
    }
    if (!version) {
      throw new Error('Could not find version metadata (static or dynamic)')
    }

    let description = meta.description || ''
    const isDynamicDescription = dynamicFields.includes('description')
    if (isDynamicDescription) {
      let readme = meta.readme
      if (typeof readme === 'object') {
        readme = readme.file
      }

      description = getDescriptionFromReadme(readme) || ''
    }

    return {
      name,
      version,
      description,
    }
  } catch (e) {
    return null
  }
}


function getHatchVersion() {
  try {
    const version = ChildProcess.execSync('hatch version', { encoding: 'utf-8' }).trim()
    return version
  } catch (e) {
    throw new Error('Failed to run `hatch version`: ' + e.message)
  }
}


function getFlitVersion() {
  try {
    const output = ChildProcess.execSync('flit info', { encoding: 'utf-8' })
    const match = output.match(/^Version:\s*(.+)$/m)
    if (match) return match[1].trim()
    throw new Error('Could not extract version from `flit info` output')
  } catch (e) {
    throw new Error('Failed to run `flit info`: ' + e.message)
  }
}


function getSetuptoolsScmVersion() {
  try {
    return ChildProcess.execSync('python -m setuptools_scm', { encoding: 'utf-8' }).trim()
  } catch (e) {
    throw new Error('Failed to run `setuptools_scm`: ' + e.message)
  }
}


function getPdmVersion() {
  try {
    return ChildProcess.execSync('pdm show --version', { encoding: 'utf-8' }).trim()
  } catch (e) {
    throw new Error('Failed to run `pdm show --version`: ' + e.message)
  }
}


function getDescriptionFromReadme(readmePath = 'README.md') {
  if (!fs.existsSync(readmePath)) {
    return ''
  }

  const content = fs.readFileSync(readmePath, 'utf-8').trim()

  const paragraphs = content.split(/\r?\n\r?\n/)
  const first = paragraphs.find(p => p.trim().length > 0)

  return first ? first.replace(/^#\s*/, '').trim() : null
}
