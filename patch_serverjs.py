# encoding utf-8
with open('backend/server.js', 'r', encoding='utf-8') as f:
    sv = f.read()

if 'Kamu sudah punya pesan kelas' in sv:
    print("server.js sudah dipatch sebelumnya")
else:
    old = """    await db.query(
      'INSERT INTO class_messages (sender_name, content) VALUES (?, ?)',
      [req.user.name, content.trim()]);
    res.json({ success: true });
  } catch(err) {
    console.error('class-board POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});"""

    new = """    const [existing] = await db.query(
      'SELECT id FROM class_messages WHERE sender_name = ?', [req.user.name]);
    if (existing.length) return res.status(409).json({
      error: 'Kamu sudah punya pesan kelas. Gunakan tombol Edit untuk mengubahnya.' });
    await db.query(
      'INSERT INTO class_messages (sender_name, content) VALUES (?, ?)',
      [req.user.name, content.trim()]);
    res.json({ success: true });
  } catch(err) {
    console.error('class-board POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});"""

    if old in sv:
        sv = sv.replace(old, new)
        print("OK: cek duplikat ditambahkan")
    else:
        print("WARN: pattern tidak ditemukan di server.js")
        print("Cari manual: INSERT INTO class_messages")

    with open('backend/server.js', 'w', encoding='utf-8') as f:
        f.write(sv)
print("server.js selesai")
