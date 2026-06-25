// Vòng lặp check thông báo hẹn giờ mỗi 60 giây
setInterval(async () => {
  const now = Date.now();
  let hasChanges = false;
  
  for (let i = scheduledAnnouncements.length - 1; i >= 0; i--) {
    const ann = scheduledAnnouncements[i];
    if (now >= ann.time) {
      try {
        const targetChannel = await client.channels.fetch(ann.channelId);
        const payload = { content: ann.content, allowedMentions: { parse: ['roles', 'users', 'everyone'] } };
        
        if (ann.imageUrl) {
          // ✅ THAY TOÀN BỘ KHỐI TRY/CATCH TẢI BUFFER BẰNG 1 DÒNG DUY NHẤT.
          // Bơm thẳng link ảnh vào đây, Discord sẽ tự động xử lý mượt mà không bao giờ bị nghẽn mạng!
          payload.files = [ann.imageUrl];
        }
        
        await targetChannel.send(payload);
      } catch (err) {
        console.error(`Lỗi gửi thông báo đã lên lịch (ID: ${ann.id}):`, err);
      }
      scheduledAnnouncements.splice(i, 1);
      hasChanges = true;
    }
  }
  // ... (Đoạn save DB giữ nguyên)
