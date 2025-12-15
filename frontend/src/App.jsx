import { useState, useEffect, useMemo, useRef } from 'react'
import './App.css'

const API_BASE = 'http://localhost:8000'

const NODE_COLORS = {
  trigger: '#8b5cf6',
  data_fetch: '#3b82f6',
  api_request: '#f59e0b',
  send_email: '#22c55e',
}

// Build graph levels from edges for proper branch visualization
function buildGraphLevels(nodes, edges) {
  const nodeNames = Object.keys(nodes)
  if (nodeNames.length === 0) return []

  // Build adjacency maps
  const children = {} // node -> nodes it points to
  const parents = {}  // node -> nodes that point to it
  
  nodeNames.forEach(name => {
    children[name] = []
    parents[name] = []
  })
  
  edges.forEach(e => {
    if (children[e.from]) children[e.from].push(e.to)
    if (parents[e.to]) parents[e.to].push(e.from)
  })

  // Find root nodes (no parents)
  const roots = nodeNames.filter(n => parents[n].length === 0)
  
  // BFS to assign levels
  const levels = {}
  const queue = roots.map(r => ({ node: r, level: 0 }))
  const visited = new Set()

  while (queue.length > 0) {
    const { node, level } = queue.shift()
    if (visited.has(node)) {
      // Update to max level if revisited
      levels[node] = Math.max(levels[node] || 0, level)
      continue
    }
    visited.add(node)
    levels[node] = level

    children[node].forEach(child => {
      queue.push({ node: child, level: level + 1 })
    })
  }

  // Handle disconnected nodes
  nodeNames.forEach(name => {
    if (levels[name] === undefined) levels[name] = 0
  })

  // Group by level
  const maxLevel = Math.max(...Object.values(levels))
  const result = []
  for (let i = 0; i <= maxLevel; i++) {
    const nodesAtLevel = nodeNames.filter(n => levels[n] === i)
    if (nodesAtLevel.length > 0) {
      result.push(nodesAtLevel)
    }
  }

  return result
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

  const graphLevels = useMemo(() => {
    if (!workflow) return []
    return buildGraphLevels(workflow.nodes, workflow.edges)
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
    
    const fetchStatus = async () => {
      try {
        const r = await fetch(`${API_BASE}/executions/${execId}`)
        const data = await r.json()
        setExecution(data)
        if (data.status === 'completed' || data.status === 'partial') {
          // Do one more fetch to ensure we have final data, then stop
          setTimeout(async () => {
            const finalR = await fetch(`${API_BASE}/executions/${execId}`)
            const finalData = await finalR.json()
            setExecution(finalData)
            setPolling(false)
          }, 200)
        }
      } catch (e) {
        console.error(e)
      }
    }
    
    const interval = setInterval(fetchStatus, 300)
    return () => clearInterval(interval)
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
                <div className="graph">
                  {graphLevels.map((level, levelIdx) => (
                    <div key={levelIdx} className="graph-level-wrapper">
                      <div className={`graph-level ${level.length > 1 ? 'parallel' : ''}`}>
                        {level.map(name => {
                          const node = workflow.nodes[name]
                          const nodeStatus = getNodeStatus(name)
                          return (
                            <div key={name} className="node-container">
                              <div 
                                className={`node ${nodeStatus?.status || ''} ${selectedNode === name ? 'selected' : ''}`}
                                style={{ 
                                  borderColor: selectedNode === name ? 'var(--accent)' : (nodeStatus ? statusColor(nodeStatus.status) : NODE_COLORS[node.type] || '#666'),
                                  boxShadow: nodeStatus?.status === 'running' ? `0 0 20px ${statusColor(nodeStatus.status)}` : (selectedNode === name ? '0 0 0 3px var(--accent-glow)' : 'none'),
                                  cursor: 'pointer'
                                }}
                                onClick={() => setSelectedNode(selectedNode === name ? null : name)}
                              >
                                <div className="node-header">
                                  <span 
                                    className="node-type-dot" 
                                    style={{ background: NODE_COLORS[node.type] || '#666' }}
                                  />
                                  <span className="node-name">{name}</span>
                                </div>
                                <div className="node-type mono">{node.type}</div>
                                {nodeStatus && (
                                  <div className="node-status" style={{ color: statusColor(nodeStatus.status) }}>
                                    {nodeStatus.status} {nodeStatus.attempts > 1 && `(${nodeStatus.attempts} attempts)`}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {levelIdx < graphLevels.length - 1 && (
                        <div className="level-connector">
                          {level.length > 1 ? (
                            <div className="merge-lines">
                              <div className="merge-horizontal" />
                              <div className="merge-vertical" />
                            </div>
                          ) : graphLevels[levelIdx + 1]?.length > 1 ? (
                            <div className="split-lines">
                              <div className="split-vertical" />
                              <div className="split-horizontal" />
                            </div>
                          ) : (
                            <div className="edge-arrow">↓</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
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
                    {graphLevels.flat().filter(name => execution.nodes[name]).map(name => {
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

