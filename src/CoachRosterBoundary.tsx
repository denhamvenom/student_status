import { Component, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from './components/ui/button'
import styles from './CoachRoster.module.css'
import { userFacingError } from './lib/error-message'

export class CoachRosterBoundary extends Component<{children:ReactNode;back?:string},{error:Error|null;revision:number}> {
  state={error:null as Error|null,revision:0}
  static getDerivedStateFromError(error:Error){return {error}}
  render(){return this.state.error?<div role="alert" className="card"><h2>Student record unavailable</h2><p>{userFacingError(this.state.error, 'This record could not be loaded. Try again or return to Team.', false)}</p><div className="action-row"><Link to={this.props.back??'/team'}>Back to Team</Link><Button type="button" variant="outline" onClick={()=>this.setState(state=>({error:null,revision:state.revision+1}))}>Try again</Button></div></div>:<div className={styles.boundary} key={this.state.revision}>{this.props.children}</div>}
}
