import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Database,
  ExternalLink,
  FileSearch,
  Folder,
  FolderOpen,
  Gauge,
  HardDrive,
  Image,
  Info,
  ListFilter,
  Loader2,
  Palette,
  Search,
  Settings,
  Shield,
  X,
} from 'lucide-react'
import './App.css'

const indexer = window.fileIndexer
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'])
const settingsSections = [
  { id: 'appearance', label: 'Aparência', icon: Palette },
  { id: 'indexing', label: 'Indexação', icon: Database },
  { id: 'search', label: 'Busca', icon: ListFilter },
  { id: 'performance', label: 'Desempenho', icon: Gauge },
  { id: 'privacy', label: 'Privacidade', icon: Shield },
  { id: 'about', label: 'Sobre', icon: Info },
]

const defaultPreferences = {
  theme: 'light',
  density: 'comfortable',
  showThumbnails: true,
  accentColor: '#7c3aed',
  includeHidden: false,
  followShortcuts: false,
  indexedExtensions: 'pdf, docx, xlsx, png, jpg, jpeg, webp, txt, md',
  fuzzySearch: true,
  searchPaths: true,
  maxResults: 100,
  searchDelay: 180,
  previewMaxMb: 15,
  excludedPatterns: 'node_modules\n.git\nAppData\nWindows\nProgram Files',
}

const springTransition = {
  type: 'spring',
  stiffness: 360,
  damping: 34,
  mass: 0.7,
}

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B'
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDate(value) {
  if (!value) return ''

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function SettingRow({ title, description, children }) {
  return (
    <label className="setting-row">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      {children}
    </label>
  )
}

function SettingsScreen({ activeSection, preferences, indexedTotal, onChange, onSectionChange, onReset }) {
  const activeSectionMeta = settingsSections.find((section) => section.id === activeSection)

  return (
    <motion.section
      className="settings-layout"
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={springTransition}
    >
      <aside className="panel settings-nav" aria-label="Categorias de opções">
        {settingsSections.map((section) => {
          const Icon = section.icon

          return (
            <button
              className={`settings-tab ${activeSection === section.id ? 'active' : ''}`}
              key={section.id}
              type="button"
              onClick={() => onSectionChange(section.id)}
            >
              <Icon size={17} aria-hidden="true" />
              {section.label}
            </button>
          )
        })}
      </aside>

      <section className="panel settings-panel">
        <header className="settings-header">
          <div>
            <h2>{activeSectionMeta.label}</h2>
            <p>Opções do Lume</p>
          </div>
          <button className="button" type="button" onClick={onReset}>
            Restaurar
          </button>
        </header>

        {activeSection === 'appearance' ? (
          <div className="settings-group">
            <SettingRow title="Tema" description="Preferência visual da interface.">
              <select value={preferences.theme} onChange={(event) => onChange('theme', event.target.value)}>
                <option value="light">Lume claro</option>
                <option value="dark">Lume escuro</option>
                <option value="xp">Windows XP</option>
              </select>
            </SettingRow>
            <SettingRow title="Densidade" description="Espaçamento da lista de resultados.">
              <select value={preferences.density} onChange={(event) => onChange('density', event.target.value)}>
                <option value="comfortable">Confortável</option>
                <option value="compact">Compacta</option>
              </select>
            </SettingRow>
            <SettingRow title="Miniaturas" description="Prévia visual para imagens encontradas.">
              <input
                type="checkbox"
                checked={preferences.showThumbnails}
                onChange={(event) => onChange('showThumbnails', event.target.checked)}
              />
            </SettingRow>
            <SettingRow title="Cor de destaque" description="Cor principal dos controles.">
              <input
                type="color"
                value={preferences.accentColor}
                onChange={(event) => onChange('accentColor', event.target.value)}
              />
            </SettingRow>
          </div>
        ) : null}

        {activeSection === 'indexing' ? (
          <div className="settings-group">
            <SettingRow title="Arquivos ocultos" description="Inclui itens ocultos durante a varredura.">
              <input
                type="checkbox"
                checked={preferences.includeHidden}
                onChange={(event) => onChange('includeHidden', event.target.checked)}
              />
            </SettingRow>
            <SettingRow title="Atalhos" description="Segue atalhos e links simbólicos.">
              <input
                type="checkbox"
                checked={preferences.followShortcuts}
                onChange={(event) => onChange('followShortcuts', event.target.checked)}
              />
            </SettingRow>
            <SettingRow title="Extensões" description="Lista separada por vírgulas.">
              <input
                type="text"
                value={preferences.indexedExtensions}
                onChange={(event) => onChange('indexedExtensions', event.target.value)}
              />
            </SettingRow>
          </div>
        ) : null}

        {activeSection === 'search' ? (
          <div className="settings-group">
            <SettingRow title="Busca aproximada" description="Aceita variações no termo pesquisado.">
              <input
                type="checkbox"
                checked={preferences.fuzzySearch}
                onChange={(event) => onChange('fuzzySearch', event.target.checked)}
              />
            </SettingRow>
            <SettingRow title="Pesquisar caminhos" description="Inclui o caminho completo no resultado.">
              <input
                type="checkbox"
                checked={preferences.searchPaths}
                onChange={(event) => onChange('searchPaths', event.target.checked)}
              />
            </SettingRow>
            <SettingRow title="Limite de resultados" description={`${preferences.maxResults} itens por busca.`}>
              <input
                type="range"
                min="25"
                max="500"
                step="25"
                value={preferences.maxResults}
                onChange={(event) => onChange('maxResults', Number(event.target.value))}
              />
            </SettingRow>
            <SettingRow title="Atraso da busca" description={`${preferences.searchDelay} ms antes de consultar.`}>
              <input
                type="range"
                min="0"
                max="600"
                step="20"
                value={preferences.searchDelay}
                onChange={(event) => onChange('searchDelay', Number(event.target.value))}
              />
            </SettingRow>
          </div>
        ) : null}

        {activeSection === 'performance' ? (
          <div className="settings-group">
            <SettingRow title="Limite de prévia" description={`${preferences.previewMaxMb} MB por imagem.`}>
              <input
                type="range"
                min="1"
                max="50"
                value={preferences.previewMaxMb}
                onChange={(event) => onChange('previewMaxMb', Number(event.target.value))}
              />
            </SettingRow>
          </div>
        ) : null}

        {activeSection === 'privacy' ? (
          <div className="settings-group">
            <SettingRow title="Exclusões" description="Uma regra por linha.">
              <textarea
                rows="6"
                value={preferences.excludedPatterns}
                onChange={(event) => onChange('excludedPatterns', event.target.value)}
              />
            </SettingRow>
          </div>
        ) : null}

        {activeSection === 'about' ? (
          <div className="about-grid">
            <div>
              <span>Versão</span>
              <strong>0.0.0</strong>
            </div>
            <div>
              <span>Arquivos indexados</span>
              <strong>{indexedTotal}</strong>
            </div>
            <div>
              <span>Banco</span>
              <strong>SQLite local</strong>
            </div>
            <div>
              <span>Interface</span>
              <strong>React + Electron</strong>
            </div>
          </div>
        ) : null}
      </section>
    </motion.section>
  )
}

function App() {
  const [activeView, setActiveView] = useState('files')
  const [activeSettingsSection, setActiveSettingsSection] = useState('appearance')
  const [preferences, setPreferences] = useState(defaultPreferences)
  const [folderPath, setFolderPath] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [imagePreviews, setImagePreviews] = useState({})
  const [selectedPreview, setSelectedPreview] = useState(null)
  const [status, setStatus] = useState('Nenhuma pasta indexada')
  const [isIndexing, setIsIndexing] = useState(false)
  const [indexedTotal, setIndexedTotal] = useState(0)
  const shouldReduceMotion = useReducedMotion()

  const canUseIndexer = Boolean(indexer)
  const motionTransition = shouldReduceMotion ? { duration: 0 } : springTransition
  const isXpTheme = preferences.theme === 'xp'
  const resultLabel = useMemo(() => {
    if (results.length === 1) return '1 arquivo'
    return `${results.length} arquivos`
  }, [results.length])
  const indexOptions = useMemo(
    () => ({
      excludedPatterns: preferences.excludedPatterns,
      followShortcuts: preferences.followShortcuts,
      includeHidden: preferences.includeHidden,
      indexedExtensions: preferences.indexedExtensions,
    }),
    [preferences.excludedPatterns, preferences.followShortcuts, preferences.includeHidden, preferences.indexedExtensions],
  )
  const searchOptions = useMemo(
    () => ({
      fuzzySearch: preferences.fuzzySearch,
      maxResults: preferences.maxResults,
      searchPaths: preferences.searchPaths,
    }),
    [preferences.fuzzySearch, preferences.maxResults, preferences.searchPaths],
  )
  const previewOptions = useMemo(
    () => ({
      previewMaxMb: preferences.previewMaxMb,
    }),
    [preferences.previewMaxMb],
  )
  const getPreviewCacheKey = useCallback(
    (file) => `${file.path}:${file.modified_at}:${file.size}:${preferences.previewMaxMb}`,
    [preferences.previewMaxMb],
  )

  function updatePreference(key, value) {
    setPreferences((currentPreferences) => ({
      ...currentPreferences,
      [key]: value,
    }))
  }

  async function chooseFolder() {
    if (!canUseIndexer) return

    const selectedPath = await indexer.selectFolder()
    if (selectedPath) {
      setFolderPath(selectedPath)
      setStatus('Pasta selecionada')
    }
  }

  async function indexFolder() {
    if (!folderPath || !canUseIndexer) return

    setIsIndexing(true)
    setStatus('Indexando arquivos')
    setImagePreviews({})
    setSelectedPreview(null)

    try {
      const result = await indexer.indexFolder(folderPath, indexOptions)
      setIndexedTotal(result.total)
      setStatus(`${result.total} arquivos indexados`)
    } catch (error) {
      console.error(error)
      setStatus('Falha ao indexar a pasta')
    } finally {
      setIsIndexing(false)
    }
  }

  useEffect(() => {
    if (!canUseIndexer) return

    let isCurrent = true
    const searchTimer = window.setTimeout(() => {
      async function searchFiles() {
        const files = await indexer.searchFiles(query, searchOptions)
        if (isCurrent) setResults(files)
      }

      searchFiles().catch((error) => {
        console.error(error)
        if (isCurrent) setStatus('Falha ao buscar arquivos')
      })
    }, preferences.searchDelay)

    return () => {
      isCurrent = false
      window.clearTimeout(searchTimer)
    }
  }, [canUseIndexer, indexedTotal, preferences.searchDelay, query, searchOptions])

  useEffect(() => {
    if (!canUseIndexer) return

    let isCurrent = true
    const imageFiles = results
      .filter((file) => imageExtensions.has(file.extension))
      .filter((file) => imagePreviews[file.path]?.cacheKey !== getPreviewCacheKey(file))
      .slice(0, 24)

    if (imageFiles.length === 0) return

    async function loadPreviews() {
      const loadedPreviews = await Promise.all(
        imageFiles.map(async (file) => {
          const preview = await indexer.getImagePreview(file.path, previewOptions)
          return [file.path, { cacheKey: getPreviewCacheKey(file), preview }]
        }),
      )

      if (!isCurrent) return

      setImagePreviews((currentPreviews) => {
        const nextPreviews = { ...currentPreviews }

        for (const [filePath, previewEntry] of loadedPreviews) {
          nextPreviews[filePath] = previewEntry
        }

        return nextPreviews
      })
    }

    loadPreviews().catch((error) => {
      console.error(error)
      if (isCurrent) setStatus('Falha ao carregar prévias')
    })

    return () => {
      isCurrent = false
    }
  }, [canUseIndexer, getPreviewCacheKey, imagePreviews, previewOptions, results])

  function openPreview(file) {
    const preview = imagePreviews[file.path]?.preview

    if (preview?.src) {
      setSelectedPreview({ file, preview })
    }
  }

  function controlWindow(action) {
    indexer?.windowControl(action)
  }

  function getPreview(file) {
    return imagePreviews[file.path]?.preview
  }

  return (
    <main
      className={`app-shell theme-${preferences.theme} density-${preferences.density}`}
      style={{ '--accent-color': preferences.accentColor }}
    >
      <motion.section
        className="xp-window"
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={motionTransition}
      >
        <div className="xp-titlebar">
          <div className="xp-title">
            <span className="xp-title-icon">
              <HardDrive size={14} aria-hidden="true" />
            </span>
            {isXpTheme ? 'Lume - Indexador de Arquivos' : 'Lume'}
          </div>
          <div className="xp-window-controls">
            <button type="button" aria-label="Minimizar" onClick={() => controlWindow('minimize')}>
              _
            </button>
            <button type="button" aria-label="Maximizar" onClick={() => controlWindow('maximize')}>
              □
            </button>
            <button className="close" type="button" aria-label="Fechar" onClick={() => controlWindow('close')}>
              ×
            </button>
          </div>
        </div>

        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <HardDrive size={20} aria-hidden="true" />
            </div>
          <div>
            <h1>Lume</h1>
            <p>Indexador local de arquivos</p>
          </div>
        </div>

        <div className="toolbar">
          <div className="view-switch" aria-label="Navegação principal">
            <button
              className={activeView === 'files' ? 'active' : ''}
              type="button"
              onClick={() => setActiveView('files')}
            >
              <FileSearch size={16} aria-hidden="true" />
              Arquivos
            </button>
            <button
              className={activeView === 'settings' ? 'active' : ''}
              type="button"
              onClick={() => setActiveView('settings')}
            >
              <Settings size={16} aria-hidden="true" />
              Opções
            </button>
          </div>
          <button className="button" type="button" onClick={chooseFolder} disabled={!canUseIndexer || activeView !== 'files'}>
            <Folder size={16} aria-hidden="true" />
            Selecionar
          </button>
          <button
            className="button primary"
            type="button"
            onClick={indexFolder}
            disabled={!folderPath || isIndexing || !canUseIndexer || activeView !== 'files'}
          >
            {isIndexing ? <Loader2 size={16} aria-hidden="true" /> : <Database size={16} aria-hidden="true" />}
            Indexar
          </button>
        </div>
        </header>

      <AnimatePresence mode="wait">
      {activeView === 'files' ? (
        <motion.section
          className="content"
          key="files"
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={motionTransition}
        >
          <motion.aside className="panel sidebar" whileHover={shouldReduceMotion ? undefined : { y: -2 }}>
            <h2>Origem</h2>
            <p className="sidebar-text">Pasta ativa para leitura e busca local.</p>
            <div className="folder-path">{folderPath || 'Nenhuma pasta selecionada'}</div>
            <div className="status-line">
              {isIndexing ? <Loader2 size={15} aria-hidden="true" /> : <FolderOpen size={15} aria-hidden="true" />}
              <span>{canUseIndexer ? status : 'Abra pelo Electron para usar o indexador'}</span>
            </div>
          </motion.aside>

          <section className="panel search-panel">
            <div className="search-box">
              <Search size={18} aria-hidden="true" />
              <input
                type="search"
                placeholder="Buscar por nome de arquivo"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={!canUseIndexer}
              />
            </div>

            <div className="results-header">
              <h2>Resultados</h2>
              <span className="result-count">{resultLabel}</span>
            </div>

            {results.length > 0 ? (
              <div className="results-list">
                {results.map((file) => (
                  <motion.article
                    className="result-row"
                    key={file.path}
                    layout={!shouldReduceMotion}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: 'easeOut' }}
                    whileHover={shouldReduceMotion ? undefined : { x: 3 }}
                  >
                    <button
                      className="thumb-button"
                      type="button"
                      onClick={() => openPreview(file)}
                      disabled={!getPreview(file)?.src || !preferences.showThumbnails}
                      title={imageExtensions.has(file.extension) ? 'Visualizar imagem' : 'Previa indisponivel'}
                    >
                      {getPreview(file)?.src && preferences.showThumbnails ? (
                        <img src={getPreview(file).src} alt="" />
                      ) : (
                        <Image size={20} aria-hidden="true" />
                      )}
                    </button>
                    <div className="file-main">
                      <p className="file-name">{file.name}</p>
                      <p className="file-path">{file.path}</p>
                      <div className="file-meta">
                        <span>{file.extension || 'sem extensao'}</span>
                        <span>{formatBytes(file.size)}</span>
                        <span>{formatDate(file.modified_at)}</span>
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        className="button icon-button"
                        type="button"
                        title="Abrir arquivo"
                        onClick={() => indexer.openFile(file.path)}
                      >
                        <ExternalLink size={16} aria-hidden="true" />
                      </button>
                      <button
                        className="button icon-button"
                        type="button"
                        title="Mostrar na pasta"
                        onClick={() => indexer.showInFolder(file.path)}
                      >
                        <FolderOpen size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </motion.article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div>
                  <FileSearch size={40} aria-hidden="true" />
                  <strong>Nenhum arquivo encontrado</strong>
                  <span>Selecione uma pasta, indexe e pesquise pelo nome.</span>
                </div>
              </div>
            )}
          </section>
        </motion.section>
      ) : (
        <SettingsScreen
          key="settings"
          activeSection={activeSettingsSection}
          indexedTotal={indexedTotal}
          preferences={preferences}
          onChange={updatePreference}
          onReset={() => setPreferences(defaultPreferences)}
          onSectionChange={setActiveSettingsSection}
        />
      )}
      </AnimatePresence>

      <AnimatePresence>
      {selectedPreview ? (
        <motion.div
          className="preview-backdrop"
          role="presentation"
          onClick={() => setSelectedPreview(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
        >
          <motion.section
            className="preview-dialog"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={motionTransition}
          >
            <header className="preview-header">
              <div>
                <h2>{selectedPreview.file.name}</h2>
                <p>{selectedPreview.file.path}</p>
              </div>
              <button
                className="button icon-button"
                type="button"
                title="Fechar"
                onClick={() => setSelectedPreview(null)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            <div className="preview-stage">
              <img src={selectedPreview.preview.src} alt={selectedPreview.file.name} />
            </div>

            <footer className="preview-footer">
              <span>{formatBytes(selectedPreview.file.size)}</span>
              <span>{formatDate(selectedPreview.file.modified_at)}</span>
              <button className="button" type="button" onClick={() => indexer.openFile(selectedPreview.file.path)}>
                <ExternalLink size={16} aria-hidden="true" />
                Abrir
              </button>
              <button className="button" type="button" onClick={() => indexer.showInFolder(selectedPreview.file.path)}>
                <FolderOpen size={16} aria-hidden="true" />
                Pasta
              </button>
            </footer>
          </motion.section>
        </motion.div>
      ) : null}
      </AnimatePresence>
      </motion.section>
    </main>
  )
}

export default App
