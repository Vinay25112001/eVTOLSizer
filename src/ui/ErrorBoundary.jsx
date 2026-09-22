import React from "react";
import { DARK, SC } from "../lib/theme.js";

export class TabErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state={hasError:false,message:""}; }
  static getDerivedStateFromError(err){ return {hasError:true,message:err?.message||"Unknown error"}; }
  componentDidCatch(err,info){ /* errors are contained — no re-throw */ void err; void info; }
  render(){
    if(this.state.hasError){
      const SC=this.props.SC||DARK; // DARK now holds INSTRUMENT palette values
      return(
        <div style={{padding:32,textAlign:"center",color:SC.red,fontFamily:"'DM Mono',monospace"}}>
          <div style={{fontSize:28,marginBottom:12}}>⚠️</div>
          <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>Tab render error</div>
          <div style={{fontSize:11,color:SC.muted,marginBottom:20}}>{this.state.message}</div>
          <button type="button"
            onClick={()=>this.setState({hasError:false,message:""})}
            style={{padding:"8px 20px",background:"transparent",border:`1px solid ${SC.red}`,
              borderRadius:5,color:SC.red,fontSize:11,cursor:"pointer",fontFamily:"'DM Mono',monospace"}}>
            ↺ Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
