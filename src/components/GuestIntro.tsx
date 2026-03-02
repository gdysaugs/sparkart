type GuestIntroProps = {
  mode: 'image' | 'video'
  onSignIn: () => void
  onEmailLogin?: () => void
}

const ASSETS = {
  upload: '/media/guest-step-upload.webp?v=20260301-1',
  output: '/media/guest-step-length.mp4?v=20260301-1',
}

const HERO_ORBIT_VIDEOS = [
  '/media/hero-orbit-1.mp4?v=20260301-1',
  '/media/hero-orbit-2.mp4?v=20260301-1',
  '/media/hero-orbit-3.mp4?v=20260301-1',
  '/media/hero-orbit-4.mp4?v=20260301-1',
  '/media/hero-orbit-5.mp4?v=20260301-1',
  '/media/hero-orbit-6.mp4?v=20260301-2',
  '/media/hero-orbit-7.mp4?v=20260301-1',
  '/media/hero-orbit-8.mp4?v=20260301-1',
]

const ENGINE_FEATURES = [
  {
    name: 'Spark',
    description: 'プロンプトに忠実で、破綻が少ない安定した生成。まずはこちらがおすすめです。',
  },
  {
    name: 'NeoSpark',
    description: '大胆で予想外の動きが出やすいエンジン。表現の幅が広い一方で、破綻は増えやすくなります。',
  },
]

const HOW_TO_USE_STEPS = [
  {
    no: '01',
    title: 'アカウントの登録',
    body: 'サービスを利用するには無料会員登録が必要です。10秒で終わります。登録するだけで5回分の生成コインが付与されます。',
  },
  {
    no: '02',
    title: '動画にしたいお好みの画像を用意',
    body: '写真でもイラストでも変換可能です。',
  },
  {
    no: '03',
    title: 'お好みのプロンプトを設定',
    body: '英語や日本語、中国語で自由に設定できます。',
  },
  {
    no: '04',
    title: '画像を変換',
    body: '最後に「生成」ボタンをクリックするだけです。',
  },
]

const USER_VOICES = [
  {
    comment: '一瞬で動画が生成されちゃう！ 魔法みたいな体験！',
    profile: '30代男性',
  },
  {
    comment: 'やみつきになっちゃう楽しさ・・。毎日お世話になってます！',
    profile: '20代男性',
  },
  {
    comment: 'AIすごい！夢でしか見れないような光景がここだとすぐ見れちゃう。',
    profile: '50代男性',
  },
  {
    comment: 'ログインボーナスがあるので毎日の日課になってしまってます。',
    profile: '30代男性',
  },
  {
    comment: '自分の理想の動画が作れる！',
    profile: '20代男性',
  },
  {
    comment: '推しの画像をかわいく動かしてます。',
    profile: '40代男性',
  },
]

export function GuestIntro({ mode: _mode, onSignIn, onEmailLogin }: GuestIntroProps) {
  return (
    <div className='pulse-landing'>
      <section className='nova-hero nova-hero--fullbleed'>
        <div className='nova-hero__inner'>
          <div className='nova-hero__copy'>
            <h1>Spark Motion</h1>
            <p>
              動画生成に特化したシンプルなスタジオです。
              1枚の画像をもとに、6秒の動画をすぐ作成できます。
            </p>
            <div className='nova-auth-buttons'>
              <button type='button' className='primary-button primary-button--glow primary-button--pink' onClick={onSignIn}>
                Googleログイン
              </button>
              {onEmailLogin && (
                <button
                  type='button'
                  className='primary-button primary-button--glow primary-button--email'
                  onClick={onEmailLogin}
                >
                  メールでログイン
                </button>
              )}
            </div>
          </div>

          <div className='nova-hero__visual'>
            <div className='nova-object' aria-hidden='true'>
              <div className='nova-ring'>
                {HERO_ORBIT_VIDEOS.map((src) => (
                  <div key={src} className='nova-face'>
                    <video src={src} autoPlay loop muted playsInline preload='metadata' />
                  </div>
                ))}
              </div>
              <div className='nova-core'>
                <span>SparkMotion</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className='pulse-flow'>
        <div className='pulse-flow__row'>
          <div className='pulse-flow__text'>
            <p>01</p>
            <h2>画像をアップロード</h2>
            <strong>元画像を1枚選ぶだけで開始できます。</strong>
          </div>
          <div className='pulse-flow__media'>
            <img src={ASSETS.upload} alt='画像アップロードの説明画像' loading='lazy' />
          </div>
        </div>

        <div className='pulse-flow__row pulse-flow__row--reverse'>
          <div className='pulse-flow__text'>
            <p>02</p>
            <h2>長さは6秒</h2>
            <strong>6秒動画を生成します。プロンプトで動きを決められます。</strong>
          </div>
          <div className='pulse-flow__media'>
            <video src={ASSETS.output} autoPlay loop muted playsInline preload='metadata' />
          </div>
        </div>
      </section>

      <section className='pulse-faq'>
        <div className='pulse-faq__head'>
          <h2>SparkMotionでできること</h2>
          <p>Spark / NeoSpark の2つの動画生成エンジンを用途に合わせて使い分けできます。</p>
        </div>
        <div className='pulse-faq__grid'>
          {ENGINE_FEATURES.map((item) => (
            <article key={item.name} className='pulse-faq__item'>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className='pulse-faq'>
        <div className='pulse-faq__head'>
          <p>HOW TO USE</p>
          <h2>動画を生成するには</h2>
        </div>
        <div className='pulse-faq__grid'>
          {HOW_TO_USE_STEPS.map((step) => (
            <article key={step.no} className='pulse-faq__item'>
              <h3>{step.no}</h3>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className='pulse-faq'>
        <div className='pulse-faq__head'>
          <p>USERS VOICE</p>
          <h2>ユーザーの声</h2>
        </div>
        <div className='pulse-faq__grid'>
          {USER_VOICES.map((voice, index) => (
            <article key={voice.profile + '-' + index} className='pulse-faq__item'>
              <h3>{voice.comment}</h3>
              <p>{voice.profile}</p>
            </article>
          ))}
        </div>
      </section>

      <section className='pulse-legal'>
        <article className='pulse-legal__card'>
          <h2>利用規約（要約）</h2>
          <p>
            本サービスは、ユーザーがアップロードした画像と入力したプロンプトをもとに動画を生成するオンラインサービスです。
            ユーザーは、法令・公序良俗に反する利用、第三者の著作権・肖像権・商標権などの権利を侵害する利用、
            不正アクセスやシステム妨害行為を行ってはなりません。生成機能の利用にはコインが必要であり、
            消費条件・付与条件は運営が定めるルールに従います。デジタルサービスの性質上、購入後のキャンセル・返金は
            原則として受け付けません（運営側の不具合を除く）。禁止行為または規約違反が確認された場合、
            運営は事前通知なく利用制限・アカウント停止等の措置を実施することがあります。
            また、サービス内容・料金・提供条件は予告なく変更または停止される場合があります。
          </p>
        </article>
        <article className='pulse-legal__card'>
          <h2>プライバシーポリシー（要約）</h2>
          <p>
            本サイト自体では個人情報を直接取得・保存しません。
            ログイン・決済などの処理は外部サービス（認証/決済基盤）を通じて実施され、
            各データの取り扱いはそれぞれの提供元ポリシーに準拠します。
          </p>
        </article>
      </section>
    </div>
  )
}



