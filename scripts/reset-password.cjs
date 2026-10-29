const firebase=require('../server/firebase');
const email=(process.argv[2]||'').trim();
if(!email||email==='--help'){console.log('Usage: npm run reset-password -- you@example.com\nSends a Firebase password reset email for that account.');process.exit(0)}
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){console.error('Enter a valid email address.');process.exit(1)}
firebase.authRequest('sendOobCode',{requestType:'PASSWORD_RESET',email}).then(()=>console.log('If the account exists, Firebase will send a password reset link.')).catch(error=>{if(error.status===401)console.log('If the account exists, Firebase will send a password reset link.');else{console.error(error.message);process.exitCode=1}});
