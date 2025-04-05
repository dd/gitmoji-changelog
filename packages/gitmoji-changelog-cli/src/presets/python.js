const fs = require('fs')
const path = require('path')
const toml = require('smol-toml')
const { execSync } = require('child_process')

module.exports = async () => {
  try {
    const pyproject = toml.parse(fs.readFileSync('pyproject.toml', 'utf-8'))
    const dynamicFields = pyproject.project.dynamic || []

    const name = pyproject.project.name
    if (!name) {
      throw new Error('Could not find name metadata in pyproject.toml')
    }

    let version = pyproject.project.version
    const isDynamicVersion = dynamicFields.includes('version')
    if (isDynamicVersion) {
      const backend = pyproject['build-system']?.['build-backend']
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

    let description = pyproject.project.description
    const isDynamicDescription = dynamicFields.includes('description')
    if (isDynamicDescription) {
      let readme = pyproject.project.readme
      if (typeof readme === 'object') {
        readme = readme.file
      }

      description = getDescriptionFromReadme(readme)
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
    const version = execSync('hatch version', { encoding: 'utf-8' }).trim()
    return version
  } catch (e) {
    throw new Error('Failed to run `hatch version`: ' + e.message)
  }
}


function getFlitVersion() {
  try {
    const output = execSync('flit info', { encoding: 'utf-8' })
    const match = output.match(/^Version:\s*(.+)$/m)
    if (match) return match[1].trim()
    throw new Error('Could not extract version from `flit info` output')
  } catch (e) {
    throw new Error('Failed to run `flit info`: ' + e.message)
  }
}


function getSetuptoolsScmVersion() {
  try {
    return execSync('python -m setuptools_scm', { encoding: 'utf-8' }).trim()
  } catch (e) {
    throw new Error('Failed to run `setuptools_scm`: ' + e.message)
  }
}


function getPdmVersion() {
  try {
    return execSync('pdm show --version', { encoding: 'utf-8' }).trim()
  } catch (e) {
    throw new Error('Failed to run `pdm show --version`: ' + e.message)
  }
}


function getDescriptionFromReadme(readmePath = 'README.md') {
  if (!fs.existsSync(readmePath)) {
    throw new Error(`README file not found: ${readmePath}`)
  }

  const content = fs.readFileSync(readmePath, 'utf-8').trim()

  const paragraphs = content.split(/\r?\n\r?\n/)
  const first = paragraphs.find(p => p.trim().length > 0)

  return first?.replace(/^#\s*/, '').trim() || null
}
