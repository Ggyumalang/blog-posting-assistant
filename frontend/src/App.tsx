import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { extractStyle, generatePost, submitFeedback } from './lib/api';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    // First try to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    
    // If user doesn't exist, try to sign up automatically for this prototype
    if (signInError && signInError.message.includes("Invalid login")) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) setError(signUpError.message);
    } else if (signInError) {
        setError(signInError.message);
    }
    
    setLoading(false);
  };

  return (
    <div className="container flex-center flex-column justify-center" style={{ minHeight: '80vh' }}>
      <form onSubmit={handleLogin} className="glass-panel text-center animate-fade-in" style={{ maxWidth: '400px', width: '100%' }}>
        <h1>Welcome Back</h1>
        <p>Log in or Sign up</p>
        
        {error && <div style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</div>}

        <div className="input-group mt-4">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="input-field" placeholder="you@example.com" />
        </div>
        <div className="input-group">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="input-field" placeholder="••••••••" />
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary w-full mt-4">
          {loading ? 'Processing...' : 'Sign In / Up'}
        </button>
      </form>
    </div>
  );
};

const Onboarding = ({ session }: { session: any }) => {
  const [blogUrl, setBlogUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleExtract = async () => {
    if (!blogUrl) return;
    setLoading(true);
    try {
      await extractStyle(blogUrl, session.user.id);
      setSuccess(true);
      setTimeout(() => navigate('/generate'), 2000);
    } catch (err) {
      alert("Extraction failed. Please check the backend connection or URL.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container animate-fade-in">
      <h1>Style Extraction</h1>
      <p>Let's learn your unique writing persona.</p>
      <div className="glass-panel mt-4">
        <div className="input-group">
          <label>Your Blog URL</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input type="url" value={blogUrl} onChange={e => setBlogUrl(e.target.value)} className="input-field w-full" placeholder="https://yourblog.com" />
            <button onClick={handleExtract} disabled={loading || !blogUrl} className="btn btn-primary">
              {loading ? 'Analyzing...' : 'Extract Style'}
            </button>
          </div>
        </div>
        {success && <p style={{ color: '#10b981', marginTop: '1rem' }}>Success! Persona learned. Redirecting...</p>}
      </div>
    </div>
  );
};

const Generator = ({ session }: { session: any }) => {
  const [imageUrl, setImageUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState('');
  const [uploading, setUploading] = useState(false);
  
  const [postId, setPostId] = useState('');
  const [editedResult, setEditedResult] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setUploading(true);
    
    try {
      // Direct supabase storage upload
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('photos').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('photos').getPublicUrl(filePath);
      setImageUrl(data.publicUrl);
    } catch (err) {
      alert("Upload failed. Make sure you created a 'photos' bucket in Supabase storage and it's public.");
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (!imageUrl) return;
    setGenerating(true);
    setSaved(false);
    try {
      const res = await generatePost(imageUrl, session.user.id);
      setResult(res.content);
      setEditedResult(res.content);
      setPostId(res.post_id);
    } catch (err) {
      alert("Generation failed. Is the backend running?");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!postId) return;
    setSaving(true);
    try {
      await submitFeedback(postId, session.user.id, result, editedResult);
      setSaved(true);
    } catch (err) {
      alert("Failed to save post and update style.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container animate-fade-in">
      <h1>Create Post</h1>
      <p>Upload a photo and let AI write in your style.</p>
      
      {!imageUrl ? (
        <div className="glass-panel text-center mt-4 p-8" style={{ borderStyle: 'dashed', borderWidth: '2px', position: 'relative' }}>
          <p>{uploading ? 'Uploading...' : 'Click to upload a photo'}</p>
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleFileUpload} 
            disabled={uploading}
            style={{ opacity: 0, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'pointer' }} 
          />
        </div>
      ) : (
        <div className="mt-4">
          <img src={imageUrl} alt="Uploaded preview" style={{ maxWidth: '100%', borderRadius: '12px', maxHeight: '300px', objectFit: 'cover' }} />
          <div className="mt-4">
            <button onClick={handleGenerate} disabled={generating} className="btn btn-primary w-full">
              {generating ? 'AI is Writing...' : 'Generate Blog Post'}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="glass-panel mt-8 animate-fade-in">
          <h2>Generated Post</h2>
          <textarea 
            className="input-field w-full" 
            style={{ height: '300px', resize: 'vertical' }} 
            value={editedResult}
            onChange={(e) => setEditedResult(e.target.value)}
          />
          <button onClick={handleSave} disabled={saving || saved} className="btn btn-secondary mt-4 w-full">
            {saving ? 'Saving...' : saved ? 'Saved & Persona Updated! ✓' : 'Save Final Post'}
          </button>
        </div>
      )}
    </div>
  );
};

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;

  return (
    <BrowserRouter>
      <div className="app-layout">
        <nav style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            AI Persona
          </h2>
          {session && <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>Sign Out</button>}
        </nav>
        
        <main>
          <Routes>
            <Route path="/login" element={!session ? <Login /> : <Navigate to="/onboarding" />} />
            <Route path="/onboarding" element={session ? <Onboarding session={session} /> : <Navigate to="/login" />} />
            <Route path="/generate" element={session ? <Generator session={session} /> : <Navigate to="/login" />} />
            <Route path="*" element={<Navigate to="/login" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
