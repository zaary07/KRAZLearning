package com.jaboutube.background;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.StreamingService;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamExtractor;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String WEB="https://jaboutude-server.onrender.com/";
    private static final ExecutorService EXECUTOR=Executors.newSingleThreadExecutor();
    private TextView status;
    private ProgressBar progress;

    @Override
    public void onCreate(Bundle state){
        super.onCreate(state);
        final LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(45,70,45,45);
        status=new TextView(this);
        status.setTextSize(19);
        status.setText("JabouTube Audio — Lecture avec écran verrouillé");
        root.addView(status);
        progress=new ProgressBar(this);
        progress.setVisibility(View.GONE);
        root.addView(progress);
        Button open=new Button(this);
        open.setText("Ouvrir JabouTube");
        open.setOnClickListener(v->openWeb());
        root.addView(open);
        setContentView(root);
        NewPipe.init(new MobileDownloader());

        final Uri data=getIntent().getData();
        if(data!=null && "jaboutube-audio".equals(data.getScheme()) && "play".equals(data.getHost())){
            final String id=data.getLastPathSegment();
            final String pos=data.getQueryParameter("t");
            if(id!=null&&id.matches("[A-Za-z0-9_-]{11}")){
                final long seconds=safeSeconds(pos);
                play(id,seconds);
            }else{status.setText("Lien vidéo invalide.");}
        }
    }
    private static long safeSeconds(String input){
        try{return Math.max(0,Math.min(86400,Long.parseLong(input)));}catch(Exception error){return 0;}
    }
    private void play(String id,long seconds){
        progress.setVisibility(View.VISIBLE);
        status.setText("Préparation du son de cette vidéo…");
        EXECUTOR.execute(()->{
            try{
                final String url="https://www.youtube.com/watch?v="+id;
                final StreamingService yt=NewPipe.getService("YouTube");
                final StreamExtractor extractor=yt.getStreamExtractor(url);
                extractor.fetchPage();
                final List<AudioStream> audio=extractor.getAudioStreams();
                String bestUrl=null;
                int bestBitrate=-1;
                if(audio!=null){
                    for(AudioStream stream:audio){
                        // NewPipe Stream.getUrl is deprecated but still supported.
                        final String candidate=stream.getUrl();
                        if(candidate!=null&&candidate.startsWith("https://")&&stream.getBitrate()>bestBitrate){
                            bestBitrate=stream.getBitrate();
                            bestUrl=candidate;
                        }
                    }
                }
                if(bestUrl==null)throw new IllegalStateException("Aucun flux audio disponible pour cette vidéo.");
                final String title=extractor.getName();
                final Intent intent=new Intent(this,PlaybackService.class);
                intent.setAction(PlaybackService.ACTION_PLAY);
                intent.putExtra(PlaybackService.EXTRA_URL,bestUrl);
                intent.putExtra(PlaybackService.EXTRA_TITLE,title);
                intent.putExtra(PlaybackService.EXTRA_POSITION,seconds*1000L);
                runOnUiThread(()->{
                    try{
                        startService(intent);
                        status.setText("Lecture native lancée. Tu peux verrouiller l’écran !");
                        progress.setVisibility(View.GONE);
                        // Keep JabouTube as the primary user interface.
                        openWeb();
                    }catch(Exception ex){showError(ex);}
                });
            }catch(Exception error){runOnUiThread(()->showError(error));}
        });
    }
    private void showError(Exception error){
        progress.setVisibility(View.GONE);
        status.setText("Lecture audio native indisponible : "+error.getMessage()+
          "\nEssaie une vidéo publique différente. Les changements de YouTube peuvent bloquer l’extracteur.");
    }
    private void openWeb(){
        try{
            Intent browser=new Intent(Intent.ACTION_VIEW,Uri.parse(WEB));
            browser.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(browser);
            finish();
        }catch(ActivityNotFoundException e){status.setText("Impossible d’ouvrir JabouTube : navigateur non disponible.");}
    }
}
