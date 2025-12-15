import { useState, useEffect, useMemo, useRef } from 'react'
import './App.css'

const API_BASE = 'http://localhost:8000'

const NODE_COLORS = {
  trigger: '#8b5cf6',
  data_fetch: '#3b82f6',
  api_request: '#f59e0b',
  send_email: '#22c55e',
}

// Build graph levels and positions from edges
function buildGraphLayout(nodes, edges) {
  const nodeNames = Object.keys(nodes)
  if (nodeNames.length === 0) return { levels: [], positions: {}, edges: [] }

  const children = {}
  const parents = {}
  
  nodeNames.forEach(name => {
    children[name] = []
    parents[name] = []
  })
  
  edges.forEach(e => {
    if (children[e.from]) children[e.from].push(e.to)
    if (parents[e.to]) parents[e.to].push(e.from)
  })

  const roots = nodeNames.filter(n => parents[n].length === 0)
  
  const levels = {}
  const queue = roots.map(r => ({ node: r, level: 0 }))
  const visited = new Set()

  while (queue.length > 0) {
    const { node, level } = queue.shift()
    if (visited.has(node)) {
      levels[node] = Math.max(levels[node] || 0, level)
      continue
    }
    visited.add(node)
    levels[node] = level
    children[node].forEach(child => {
      queue.push({ node: child, level: level + 1 })
    })
  }

  nodeNames.forEach(name => {
    if (levels[name] === undefined) levels[name] = 0
  })

  const maxLevel = Math.max(...Object.values(levels))
  const levelGroups = []
  for (let i = 0; i <= maxLevel; i++) {
    levelGroups.push(nodeNames.filter(n => levels[n] === i))
  }

  // Compute positions (x, y) for each node
  const NODE_WIDTH = 150
  const NODE_HEIGHT = 80
  const H_GAP = 30
  const V_GAP = 60
  const positions = {}
  
  levelGroups.forEach((group, levelIdx) => {
    const totalWidth = group.length * NODE_WIDTH + (group.length - 1) * H_GAP
    const startX = -totalWidth / 2
    group.forEach((name, idx) => {
      positions[name] = {
        x: startX + idx * (NODE_WIDTH + H_GAP) + NODE_WIDTH / 2,
        y: levelIdx * (NODE_HEIGHT + V_GAP) + NODE_HEIGHT / 2
      }
    })
  })

  return { levels: levelGroups, positions, edges, nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT }
}

function App() {
  const [workflows, setWorkflows] = useState([])
  const [selected, setSelected] = useState(null)
  const [workflow, setWorkflow] = useState(null)
  const [inputJson, setInputJson] = useState('{\n  "user_id": 123\n}')
  const [execution, setExecution] = useState(null)
  const [polling, setPolling] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newWorkflowName, setNewWorkflowName] = useState('')
  const [newWorkflowJson, setNewWorkflowJson] = useState(`{
  "nodes": {
    "start": {
      "type": "trigger",
      "config": {}
    }
  },
  "edges": []
}`)
  const executionIdRef = useRef(null)

  const graphLayout = useMemo(() => {
    if (!workflow) return { levels: [], positions: {}, edges: [], nodeWidth: 150, nodeHeight: 80 }
    return buildGraphLayout(workflow.nodes, workflow.edges)
  }, [workflow])

  const refreshWorkflows = () => {
    fetch(`${API_BASE}/workflows`)
      .then(r => r.json())
      .then(data => setWorkflows(data.workflows))
      .catch(console.error)
  }

  useEffect(() => {
    refreshWorkflows()
  }, [])

  useEffect(() => {
    if (!selected) return
    fetch(`${API_BASE}/workflows/${selected}`)
      .then(r => r.json())
      .then(setWorkflow)
      .catch(console.error)
  }, [selected])

  useEffect(() => {
    if (!polling || !executionIdRef.current) return
    
    const execId = executionIdRef.current
    let stopped = false
    let completedCount = 0
    
    const fetchStatus = async () => {
      if (stopped) return
      try {
        const r = await fetch(`${API_BASE}/executions/${execId}`)
        const data = await r.json()
        if (stopped) return
        setExecution(data)
        
        // When completed, keep polling a few more times to ensure we have all data
        if (data.status === 'completed' || data.status === 'partial' || data.status === 'failed') {
          completedCount++
          if (completedCount >= 3) {
            stopped = true
            setPolling(false)
          }
        }
      } catch (e) {
        console.error(e)
      }
    }
    
    // Fetch immediately, then every 200ms
    fetchStatus()
    const interval = setInterval(fetchStatus, 200)
    return () => { stopped = true; clearInterval(interval) }
  }, [polling])

  const runWorkflow = async () => {
    if (!selected) return
    try {
      const input = JSON.parse(inputJson)
      const res = await fetch(`${API_BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: selected, input })
      })
      const data = await res.json()
      setExecution(data)
      executionIdRef.current = data.execution_id
      setPolling(true)
    } catch (e) {
      alert('Invalid JSON or execution error: ' + e.message)
    }
  }

  const getNodeStatus = (nodeName) => {
    if (!execution?.nodes) return null
    return execution.nodes[nodeName]
  }

  const statusColor = (status) => {
    if (!status) return 'var(--pending)'
    switch (status) {
      case 'success': return 'var(--success)'
      case 'running': return 'var(--warning)'
      case 'failed': return 'var(--error)'
      default: return 'var(--pending)'
    }
  }

  const createWorkflow = async () => {
    if (!newWorkflowName.trim()) {
      alert('Please enter a workflow name')
      return
    }
    try {
      const workflowData = JSON.parse(newWorkflowJson)
      const res = await fetch(`${API_BASE}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWorkflowName, workflow: workflowData })
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.detail || 'Failed to create workflow')
        return
      }
      const data = await res.json()
      setShowCreateModal(false)
      setNewWorkflowName('')
      refreshWorkflows()
      setSelected(data.name)
    } catch (e) {
      alert('Invalid JSON: ' + e.message)
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <span>Workflow Engine</span>
        </div>
        <div className="workflow-list">
          <div className="workflow-list-header">
            <h3>Workflows</h3>
            <button className="add-workflow-btn" onClick={() => setShowCreateModal(true)}>+</button>
          </div>
          {workflows.map(w => (
            <button
              key={w.name}
              className={`workflow-item ${selected === w.name ? 'active' : ''}`}
              onClick={() => { setSelected(w.name); setExecution(null); setSelectedNode(null); executionIdRef.current = null; setPolling(false); }}
            >
              <span className="workflow-name">{w.name}</span>
              <span className="workflow-meta">{w.node_count} nodes</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="main">
        {!workflow ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h2>Select a workflow</h2>
            <p>Choose a workflow from the sidebar to view its graph and execute it.</p>
          </div>
        ) : (
          <>
            <header className="header">
              <div>
                <h1>{workflow.name}</h1>
                <p className="mono text-muted">{workflow.workflow_id}</p>
              </div>
              <div className="header-actions">
                {execution && (
                  <div className={`status-badge status-${execution.status}`}>
                    {execution.status}
                  </div>
                )}
              </div>
            </header>

            <div className="content">
              <div className="graph-section">
                <h3>Node Graph</h3>
                <div className="graph-container">
                  {(() => {
                    const { levels, positions, edges, nodeWidth, nodeHeight } = graphLayout
                    if (levels.length === 0) return null
                    
                    // Calculate SVG dimensions
                    const allX = Object.values(positions).map(p => p.x)
                    const allY = Object.values(positions).map(p => p.y)
                    const minX = Math.min(...allX) - nodeWidth/2 - 20
                    const maxX = Math.max(...allX) + nodeWidth/2 + 20
                    const maxY = Math.max(...allY) + nodeHeight/2 + 20
                    const svgWidth = maxX - minX
                    const svgHeight = maxY + 20
                    const offsetX = -minX

                    return (
                      <svg width={svgWidth} height={svgHeight} className="graph-svg">
                        <defs>
                          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#555" />
                          </marker>
                        </defs>
                        
                        {/* Draw edges */}
                        {edges.map((edge, idx) => {
                          const from = positions[edge.from]
                          const to = positions[edge.to]
                          if (!from || !to) return null
                          return (
                            <line
                              key={idx}
                              x1={from.x + offsetX}
                              y1={from.y + nodeHeight/2}
                              x2={to.x + offsetX}
                              y2={to.y - nodeHeight/2}
                              stroke="#555"
                              strokeWidth="2"
                              markerEnd="url(#arrowhead)"
                            />
                          )
                        })}
                        
                        {/* Draw nodes */}
                        {Object.entries(positions).map(([name, pos]) => {
                          const node = workflow.nodes[name]
                          const nodeStatus = getNodeStatus(name)
                          const isSelected = selectedNode === name
                          const borderColor = isSelected ? '#06b6d4' : (nodeStatus ? statusColor(nodeStatus.status) : NODE_COLORS[node.type] || '#666')
                          
                          return (
                            <g
                              key={name}
                              transform={`translate(${pos.x + offsetX - nodeWidth/2}, ${pos.y - nodeHeight/2})`}
                              onClick={() => setSelectedNode(isSelected ? null : name)}
                              style={{ cursor: 'pointer' }}
                            >
                              <rect
                                width={nodeWidth}
                                height={nodeHeight}
                                rx="8"
                                fill="#1a1a2e"
                                stroke={borderColor}
                                strokeWidth={isSelected ? 3 : 2}
                              />
                              <circle cx="12" cy="18" r="5" fill={NODE_COLORS[node.type] || '#666'} />
                              <text x="22" y="22" fill="#e0e0e0" fontSize="13" fontWeight="600">{name}</text>
                              <text x="10" y="42" fill="#888" fontSize="11" fontFamily="monospace">{node.type}</text>
                              {nodeStatus && (
                                <text x="10" y="62" fill={statusColor(nodeStatus.status)} fontSize="10">
                                  {nodeStatus.status}{nodeStatus.attempts > 1 ? ` (${nodeStatus.attempts}x)` : ''}
                                </text>
                              )}
                            </g>
                          )
                        })}
                      </svg>
                    )
                  })()}
                </div>

                {selectedNode && workflow.nodes[selectedNode] && (
                  <div className="node-detail">
                    <div className="node-detail-header">
                      <h4>{selectedNode}</h4>
                      <button className="close-btn" onClick={() => setSelectedNode(null)}>×</button>
                    </div>
                    <div className="node-detail-content">
                      <div className="detail-row">
                        <span className="detail-label">Type</span>
                        <span className="detail-value mono">{workflow.nodes[selectedNode].type}</span>
                      </div>
                      
                      {Object.keys(workflow.nodes[selectedNode].config || {}).length > 0 && (
                        <div className="detail-section">
                          <span className="detail-label">Configuration</span>
                          <pre className="detail-config mono">
                            {JSON.stringify(workflow.nodes[selectedNode].config, null, 2)}
                          </pre>
                        </div>
                      )}

                      {getNodeStatus(selectedNode) && (
                        <>
                          <div className="detail-row">
                            <span className="detail-label">Status</span>
                            <span 
                              className="detail-value" 
                              style={{ color: statusColor(getNodeStatus(selectedNode).status) }}
                            >
                              {getNodeStatus(selectedNode).status}
                            </span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Attempts</span>
                            <span className="detail-value">{getNodeStatus(selectedNode).attempts}</span>
                          </div>
                          {getNodeStatus(selectedNode).output && (
                            <div className="detail-section">
                              <span className="detail-label">Output</span>
                              <pre className="detail-output mono">
                                {JSON.stringify(getNodeStatus(selectedNode).output, null, 2)}
                              </pre>
                            </div>
                          )}
                          {getNodeStatus(selectedNode).error && (
                            <div className="detail-section">
                              <span className="detail-label">Error</span>
                              <pre className="detail-error mono">
                                {getNodeStatus(selectedNode).error}
                              </pre>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="control-section">
                <h3>Execute</h3>
                <div className="input-group">
                  <label>Input JSON</label>
                  <textarea
                    className="json-input mono"
                    value={inputJson}
                    onChange={e => setInputJson(e.target.value)}
                    rows={6}
                  />
                </div>
                <button 
                  className="run-button" 
                  onClick={runWorkflow}
                  disabled={polling}
                >
                  {polling ? (
                    <>
                      <span className="spinner" /> Running...
                    </>
                  ) : (
                    <>▶ Run Workflow</>
                  )}
                </button>

                {execution?.nodes && Object.keys(execution.nodes).length > 0 && (
                  <div className="results">
                    <h4>Results</h4>
                    {graphLayout.levels.flat().filter(name => execution.nodes[name]).map(name => {
                      const node = execution.nodes[name]
                      return (
                        <div key={name} className="result-item">
                          <div className="result-header">
                            <span className="result-name">{name}</span>
                            <span 
                              className="result-status"
                              style={{ color: statusColor(node.status) }}
                            >
                              {node.status}
                            </span>
                          </div>
                          {node.output && (
                            <pre className="result-output mono">
                              {JSON.stringify(node.output, null, 2)}
                            </pre>
                          )}
                          {node.error && (
                            <pre className="result-error mono">{node.error}</pre>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Workflow</h2>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label>Workflow Name</label>
                <input
                  type="text"
                  className="text-input"
                  value={newWorkflowName}
                  onChange={e => setNewWorkflowName(e.target.value)}
                  placeholder="my_workflow"
                />
              </div>
              <div className="input-group">
                <label>Workflow JSON</label>
                <textarea
                  className="json-input mono"
                  value={newWorkflowJson}
                  onChange={e => setNewWorkflowJson(e.target.value)}
                  rows={15}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="save-btn" onClick={createWorkflow}>Save Workflow</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

