# Deploy Checklist

[ ] chmod +x build.sh run.sh logs.sh
[ ] ./build.sh chạy thành công
[ ] ./run.sh chạy thành công
[ ] docker ps thấy container running
[ ] curl http://127.0.0.1:3000 trả về HTML
[ ] Nginx reload thành công
[ ] Domain mở được app
[ ] Refresh route con không lỗi
[ ] /service/... proxy được
[ ] /stocktraders-api/... proxy được
[ ] /api/portfolio-chat proxy được tới Portfolio Chat backend
[ ] /socket.io/... proxy được cho Socket.IO realtime
[ ] Các /api/... path hiện frontend đang gọi đã có backend/proxy production tương ứng
[ ] Assets JS/CSS load đúng
