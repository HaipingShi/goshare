# HTML-Go Express Docker u5b89u88c5u6307u5357

u672cu6587u6863u63d0u4f9bu4e86u4f7fu7528 Docker u90e8u7f72 HTML-Go Express u5e94u7528u7a0bu5e8fu7684u8be6u7ec6u6b65u9aa4u3002

## u5148u51b3u6761u4ef6

- u5b89u88c5 [Docker](https://docs.docker.com/get-docker/)
- u5b89u88c5 [Docker Compose](https://docs.docker.com/compose/install/)

## u5febu901fu5b89u88c5

### u65b9u6cd5 1uff1au4f7fu7528 Docker Composeuff08u63a8u8350uff09

1. u514bu9686u4ed3u5e93uff08u5982u679cu5df2u6709u4ee3u7801uff0cu8df3u8fc7u6b64u6b65u9aa4uff09
   ```bash
   git clone https://github.com/HaipingShi/goshare.git
   cd goshare
   ```

2. u542fu52a8u5e94u7528
   ```bash
   docker-compose up -d
   ```

3. u67e5u770bu65e5u5fd7uff08u53efu9009uff09
   ```bash
   docker-compose logs -f
   ```

4. u8bbfu95eeu5e94u7528
   u6253u5f00u6d4fu89c8u5668u8bbfu95eeuff1a`http://localhost:8888`

### u65b9u6cd5 2uff1au4f7fu7528 Docker u547du4ee4

1. u514bu9686u4ed3u5e93uff08u5982u679cu5df2u6709u4ee3u7801uff0cu8df3u8fc7u6b64u6b65u9aa4uff09
   ```bash
   git clone https://github.com/HaipingShi/goshare.git
   cd goshare
   ```

2. u6784u5efa Docker u955cu50cf
   ```bash
   docker build -t html-go-express .
   ```

3. u521bu5efau6570u636eu5377
   ```bash
   docker volume create html-go-data
   ```

4. u8fd0u884cu5bb9u5668
   ```bash
   docker run -d --name html-go-express \
     -p 8888:8888 \
     -v html-go-data:/usr/src/app/data \
     -e NODE_ENV=production \
     -e PORT=8888 \
     --restart unless-stopped \
     html-go-express
   ```

5. u67e5u770bu65e5u5fd7uff08u53efu9009uff09
   ```bash
   docker logs -f html-go-express
   ```

6. u8bbfu95eeu5e94u7528
   u6253u5f00u6d4fu89c8u5668u8bbfu95eeuff1a`http://localhost:8888`

## u7ba1u7406u5bb9u5668

### u4f7fu7528 Docker Compose

- **u505cu6b62u5e94u7528**
  ```bash
  docker-compose down
  ```

- **u91cdu542fu5e94u7528**
  ```bash
  docker-compose restart
  ```

- **u67e5u770bu5bb9u5668u72b6u6001**
  ```bash
  docker-compose ps
  ```

### u4f7fu7528 Docker u547du4ee4

- **u505cu6b62u5bb9u5668**
  ```bash
  docker stop html-go-express
  ```

- **u542fu52a8u5bb9u5668**
  ```bash
  docker start html-go-express
  ```

- **u91cdu542fu5bb9u5668**
  ```bash
  docker restart html-go-express
  ```

- **u5220u9664u5bb9u5668**
  ```bash
  docker rm -f html-go-express
  ```

## u66f4u65b0u5e94u7528

### u4f7fu7528 Docker Compose

1. u62c9u53d6u6700u65b0u4ee3u7801
   ```bash
   git pull origin main
   ```

2. u91cdu65b0u6784u5efau5e76u542fu52a8
   ```bash
   docker-compose up -d --build
   ```

### u4f7fu7528 Docker u547du4ee4

1. u62c9u53d6u6700u65b0u4ee3u7801
   ```bash
   git pull origin main
   ```

2. u505cu6b62u5e76u5220u9664u65e7u5bb9u5668
   ```bash
   docker stop html-go-express
   docker rm html-go-express
   ```

3. u91cdu65b0u6784u5efau955cu50cf
   ```bash
   docker build -t html-go-express .
   ```

4. u8fd0u884cu65b0u5bb9u5668
   ```bash
   docker run -d --name html-go-express \
     -p 8888:8888 \
     -v html-go-data:/usr/src/app/data \
     -e NODE_ENV=production \
     -e PORT=8888 \
     --restart unless-stopped \
     html-go-express
   ```

## u81eau5b9au4e49u914du7f6e

u60a8u53efu4ee5u901au8fc7u4feeu6539 `docker-compose.yml` u6587u4ef6u6216u5728u8fd0u884c Docker u547du4ee4u65f6u6dfbu52a0u73afu5883u53d8u91cfu6765u81eau5b9au4e49u5e94u7528u7a0bu5e8fu7684u914du7f6eu3002

### u53efu7528u7684u73afu5883u53d8u91cf

- `NODE_ENV`: u8fd0u884cu73afu5883uff08production u6216 developmentuff09
- `PORT`: u5e94u7528u7a0bu5e8fu7aefu53e3

## u6570u636eu6301u4e45u5316

u5e94u7528u7a0bu5e8fu7684u6570u636eu5b58u50a8u5728 Docker u5377 `html-go-data` u4e2duff0cu5373u4f7fu5bb9u5668u88abu5220u9664uff0cu6570u636eu4e5fu4f1au4fddu7559u3002

### u5907u4efdu6570u636e

```bash
docker run --rm -v html-go-data:/data -v $(pwd):/backup alpine tar -czvf /backup/html-go-data-backup.tar.gz /data
```

### u6062u590du6570u636e

```bash
# u9996u5148u505cu6b62u5bb9u5668
docker-compose down
# u6216
docker stop html-go-express

# u6062u590du6570u636e
docker run --rm -v html-go-data:/data -v $(pwd):/backup alpine sh -c "rm -rf /data/* && tar -xzvf /backup/html-go-data-backup.tar.gz -C /"

# u91cdu542fu5bb9u5668
docker-compose up -d
# u6216
docker start html-go-express
```

## u6545u969cu6392u9664

### u67e5u770bu5bb9u5668u65e5u5fd7

```bash
docker logs -f html-go-express
```

### u68c0u67e5u5bb9u5668u72b6u6001

```bash
docker ps -a | grep html-go-express
```

### u8fdbu5165u5bb9u5668u5185u90e8

```bash
docker exec -it html-go-express /bin/sh
```

### u5e38u89c1u95eeu9898

1. **u7aefu53e3u51b2u7a81**
   u5982u679c 8888 u7aefu53e3u5df2u88abu5360u7528uff0cu8bf7u4feeu6539 docker-compose.yml u6216 docker run u547du4ee4u4e2du7684u7aefu53e3u6620u5c04u3002

2. **u6570u636eu6743u9650u95eeu9898**
   u5982u679cu9047u5230u6570u636eu76eeu5f55u6743u9650u95eeu9898uff0cu53efu4ee5u5c1du8bd5u8fdbu5165u5bb9u5668u5e76u624bu52a8u8bbeu7f6eu6743u9650uff1a
   ```bash
   docker exec -it html-go-express /bin/sh
   chmod -R 777 /usr/src/app/data
   ```

## u5b89u5168u6ce8u610fu4e8bu9879

- u5728u751fu4ea7u73afu5883u4e2duff0cu5efau8baeu4f7fu7528u53cdu5411u4ee3u7406uff08u5982 Nginx u6216 Traefikuff09u6765u4fddu62a4u60a8u7684u5e94u7528u7a0bu5e8fu3002
- u8003u8651u4f7fu7528 HTTPS u6765u52a0u5bc6u6d41u91cfu3002
- u5b9au671fu5907u4efdu60a8u7684u6570u636eu3002

## u9644u5f55uff1au4f7fu7528 Docker Hub u955cu50cf

u5982u679cu60a8u5e0cu671bu5c06u60a8u7684u955cu50cfu63a8u9001u5230 Docker Hubuff0cu8bf7u6309u7167u4ee5u4e0bu6b65u9aa4u64cdu4f5cuff1a

1. u767bu5f55u5230 Docker Hub
   ```bash
   docker login
   ```

2. u4e3au60a8u7684u955cu50cfu6253u6807u7b7e
   ```bash
   docker tag html-go-express u60a8u7684u7528u6237u540d/html-go-express:latest
   ```

3. u63a8u9001u955cu50cf
   ```bash
   docker push u60a8u7684u7528u6237u540d/html-go-express:latest
   ```

4. u4f7fu7528u63a8u9001u7684u955cu50cf
   ```bash
   docker run -d --name html-go-express \
     -p 8888:8888 \
     -v html-go-data:/usr/src/app/data \
     -e NODE_ENV=production \
     -e PORT=8888 \
     --restart unless-stopped \
     u60a8u7684u7528u6237u540d/html-go-express:latest
   ```
