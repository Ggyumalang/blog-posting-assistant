# 1. 프로젝트 개요 (Project Overview)

- **서비스 컨셉:** 사용자의 기존 블로그 글쓰기 스타일을 AI가 학습하여, 사용자가 사진을 업로드하면 해당 사진의 맥락에 맞는 글을 사용자의 고유한 문체로 자동 작성해 주는 서비스.
- **주요 타겟:** 주기적인 블로그 포스팅에 부담을 느끼는 크리에이터, 일상을 기록하고 싶지만 글쓰기에 어려움을 겪는 일반 사용자.
- **핵심 가치:** '개인화된 문체(Persona)' 유지, '사진(Vision)' 기반의 맥락 이해 및 텍스트 자동 생성.

# 2. 시스템 아키텍처 (System Architecture)

현재 설정된 기술 스택을 바탕으로 한 전체 시스템 구조입니다.

- **Frontend (Client):** `React` + `Vite`
    - 빠른 빌드와 렌더링을 통한 쾌적한 UX 제공.
    - 사진 업로드, 실시간 생성 텍스트 스트리밍 렌더링, 텍스트 에디터 기능 구현.
- **Backend (API & AI Core):** `Python` (프레임워크: FastAPI 권장)
    - **FastAPI:** 비동기 처리에 강점이 있어 AI API 대기 시간 처리에 유리하며, React 프론트엔드와 RESTful API로 통신.
    - **AI 파이프라인:** LangChain 등을 활용하여 프롬프트 템플릿 관리, Vision-Language Model(예: Gemini 1.5 Pro, GPT-4o) API 호출.
    - **데이터 수집기:** 블로그 URL 기반 크롤링 로직 수행(BeautifulSoup 등 활용).
- **Database & BaaS:** `Supabase Cloud`
    - **Auth:** 사용자 가입 및 로그인 (소셜 로그인 연동 용이).
    - **PostgreSQL:** 사용자 정보, 추출된 '스타일 프롬프트', 생성 이력 저장.
    - **Storage:** 사용자가 업로드한 원본 사진 임시/영구 저장.

# 3. 핵심 워크플로우 (Core Workflows)

각 기능 단위를 모듈화하여 개발할 수 있도록 주요 플로우를 정의합니다.

### Flow A. 온보딩 및 스타일 추출 (Style Extraction)

1. **[React]** 사용자가 자신의 블로그 URL 또는 기존에 작성한 텍스트 샘플(10~20개)을 입력.
2. **[Python]** URL 입력 시, 백엔드에서 해당 블로그의 최근 게시글을 크롤링하여 순수 텍스트만 추출.
3. **[Python]** 추출된 텍스트를 LLM에 전달하여 "사용자의 어조, 문장 구조, 자주 쓰는 표현, 단락 나누기 패턴"을 분석 요청.
4. **[Python]** 분석 결과를 정형화된 `System Prompt`(스타일 가이드라인) 형태로 가공.
5. **[Supabase Cloud]** 생성된 `style_prompt`를 해당 사용자의 DB 레코드에 업데이트.

### Flow B. 사진 기반 포스팅 생성 (Content Generation)

1. **[React]** 사용자가 포스팅할 사진 업로드.
2. **[React]** 사진 파일을 Supabase Storage에 직접 업로드하고 `image_url` 획득.
3. **[React]** 백엔드 API로 `image_url` 전달하며 생성 요청.
4. **[Python]** Supabase DB에서 해당 사용자의 `style_prompt` 조회.
5. **[Python]** Vision LLM API에 `image_url`과 함께 아래와 같은 동적 프롬프트 전송:
    
    > *"이 사진의 상황과 객체를 묘사하는 블로그 글을 써줘. 단, 다음 [스타일 가이드라인: style_prompt]의 문체와 포맷을 반드시 준수할 것."*
    > 
6. **[Python -> React]** 생성된 텍스트를 프론트엔드로 반환 (스트리밍 방식 권장).

### Flow C. 피드백 루프 및 미세조정 (Feedback Loop)

1. **[React]** 사용자가 AI가 생성한 초안을 에디터에서 수정 후 '발행/완료' 클릭.
2. **[Python]** 원본 생성 글과 사용자가 수정한 최종 글의 Diff(차이점)를 분석.
3. **[Python]** 향후 생성을 위해 사용자의 `style_prompt`를 백그라운드에서 업데이트 (Supabase DB 반영).

# 4. 데이터베이스 스키마 설계 (Supabase Cloud)

초기 MVP 구현을 위한 핵심 테이블 구조입니다.

**1. `users` (Supabase Auth와 연동되는 확장 테이블)**

- `id` (uuid, PK): 사용자 고유 ID
- `email` (string): 사용자 이메일
- `blog_url` (string, nullable): 수집 대상 블로그 주소
- `created_at` (timestamp)

**2. `user_styles` (사용자별 글쓰기 스타일 정보)**

- `id` (uuid, PK)
- `user_id` (uuid, FK to users.id)
- `style_prompt` (text): AI가 분석해 낸 사용자의 글쓰기 페르소나/가이드라인
- `sample_texts` (text, nullable): 분석에 사용된 원본 샘플 텍스트 (추후 재분석용)
- `updated_at` (timestamp)

**3. `posts` (글 생성 이력)**

- `id` (uuid, PK)
- `user_id` (uuid, FK to users.id)
- `image_url` (string): Supabase Storage에 저장된 사진 경로
- `generated_content` (text): AI가 최초로 생성한 텍스트 초안
- `final_content` (text, nullable): 사용자가 최종 수정한 텍스트
- `created_at` (timestamp)

# 5. API 명세서 초안 (Python Backend)

Antigravity 툴에서 API 연동 테스트 및 목업 생성을 위해 활용할 수 있는 REST API 엔드포인트 설계입니다.

| **Method** | **Endpoint** | **Description** | **Request Body** | **Response** |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/style/extract` | 블로그 텍스트 분석 및 스타일 프롬프트 생성 | `{"blog_url": "...", "user_id": "..."}` | `{"status": "success", "style_id": "..."}` |
| `POST` | `/api/v1/post/generate` | 사진 기반 맞춤형 블로그 글 생성 | `{"image_url": "...", "user_id": "..."}` | `{"content": "생성된 텍스트..."}` (or SSE Stream) |
| `PUT` | `/api/v1/style/feedback` | 사용자 수정 내역 바탕으로 스타일 프롬프트 업데이트 | `{"post_id": "...", "final_content": "..."}` | `{"status": "updated"}` |