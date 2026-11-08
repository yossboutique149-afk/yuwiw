import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout, RequireAuth } from './components/ui';
import { useAuth } from './lib/core';
import { AuthPage } from './pages/auth';
import { CreatePage, ExplorePage, HomePage, PostPage, ProfilePage } from './pages/feed';
import { MessagesPage } from './pages/messages';
import { FoDetailPage, FoRegistryPage, LorePage, YumesonaPage, YumesonasPage } from './pages/yume';
import {
  AlbumPage,
  CommunitiesPage,
  CommunityPage,
  DiaryPage,
  GalleryPage,
  MemoriesPage,
  StoriesPage,
  StoryPage,
} from './pages/creations';
import { CharacterChatPage, CharacterWorldPage } from './pages/characters';
import { PortraitEditorPage, PortraitHomePage } from './pages/portrait';
import { MusicPage } from './pages/music';
import { VideoPage } from './pages/video';
import { GamePlayerPage, GamesPage } from './pages/games';
import { NotificationCenterPage, SettingsPage } from './pages/notifications';

function NotFound() {
  return (
    <div className="page">
      <div className="empty">
        <div className="empty-star">✦</div>
        <h2>404</h2>
        <p>This corner of the universe has not been written yet.</p>
        <a className="btn btn-primary" href="/">
          Back to YumEra
        </a>
      </div>
    </div>
  );
}

function Guard({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

export default function App() {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div className="boot">
        <div className="boot-mark">✦</div>
        <p>YUMERA</p>
        <small>Eternal Universe</small>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/post/:id" element={<PostPage />} />
        <Route path="/u/:username" element={<ProfilePage />} />
        <Route path="/create" element={<Guard><CreatePage /></Guard>} />
        <Route path="/messages" element={<Guard><MessagesPage /></Guard>} />
        <Route path="/messages/:id" element={<Guard><MessagesPage /></Guard>} />

        <Route path="/yumesonas" element={<Guard><YumesonasPage /></Guard>} />
        <Route path="/yumesonas/:id" element={<YumesonaPage />} />
        <Route path="/fo" element={<Guard><FoRegistryPage /></Guard>} />
        <Route path="/fo/:id" element={<FoDetailPage />} />
        <Route path="/lore" element={<Guard><LorePage /></Guard>} />

        <Route path="/stories" element={<StoriesPage />} />
        <Route path="/stories/:id" element={<StoryPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/gallery/:id" element={<AlbumPage />} />
        <Route path="/memories" element={<MemoriesPage />} />
        <Route path="/memories/:id" element={<AlbumPage />} />
        <Route path="/diary" element={<Guard><DiaryPage /></Guard>} />
        <Route path="/communities" element={<CommunitiesPage />} />
        <Route path="/communities/:id" element={<CommunityPage />} />
        <Route path="/characters" element={<Guard><CharacterWorldPage /></Guard>} />
        <Route path="/characters/:id" element={<Guard><CharacterChatPage /></Guard>} />

        <Route path="/portrait" element={<PortraitHomePage />} />
        <Route path="/portrait/:id" element={<Guard><PortraitEditorPage /></Guard>} />
        <Route path="/music" element={<MusicPage />} />
        <Route path="/video" element={<VideoPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/games/:id" element={<GamePlayerPage />} />

        <Route path="/notifications" element={<Guard><NotificationCenterPage /></Guard>} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
