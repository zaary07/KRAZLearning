package com.jaboutube.background;

import android.content.Intent;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

public final class PlaybackService extends MediaSessionService {
    public static final String ACTION_PLAY = "com.jaboutube.background.PLAY";
    public static final String EXTRA_URL = "stream";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_POSITION = "positionMs";
    private MediaSession session;
    private ExoPlayer player;

    @Override
    public void onCreate() {
        super.onCreate();
        player = new ExoPlayer.Builder(this).build();
        session = new MediaSession.Builder(this,player).build();
    }
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent!=null && ACTION_PLAY.equals(intent.getAction())) {
            String url = intent.getStringExtra(EXTRA_URL);
            if (url != null && url.startsWith("https://")) {
                String title = intent.getStringExtra(EXTRA_TITLE);
                if (title == null || title.isEmpty()) title="JabouTube";
                MediaItem item = new MediaItem.Builder()
                  .setUri(url)
                  .setMediaMetadata(new MediaMetadata.Builder().setTitle(title).setArtist("JabouTube Audio").build())
                  .build();
                player.setMediaItem(item);
                player.seekTo(Math.max(0,intent.getLongExtra(EXTRA_POSITION,0)));
                player.prepare();
                player.play();
            }
        }
        return super.onStartCommand(intent, flags, startId);
    }
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return session;
    }
    @Override
    public void onDestroy() {
        if (session!=null) {session.release();session=null;}
        if (player!=null) {player.release();player=null;}
        super.onDestroy();
    }
}
