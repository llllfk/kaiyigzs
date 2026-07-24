package cn.kaiyi.salescrm;

import android.graphics.Color;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

/**
 * 宣传页用 XML 渐变 + TextView（矢量文字），避免位图放大发糊。
 */
public class MainActivity extends BridgeActivity {
    private boolean holdSystemSplash = true;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> holdSystemSplash);
        splashScreen.setOnExitAnimationListener(provider -> provider.remove());

        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);

        ViewGroup content = findViewById(android.R.id.content);
        if (content == null) {
            holdSystemSplash = false;
            return;
        }

        View promo = LayoutInflater.from(this).inflate(R.layout.promo_splash, content, false);
        content.addView(
            promo,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        holdSystemSplash = false;

        promo.postDelayed(
            () -> {
                if (promo.getParent() instanceof ViewGroup) {
                    ((ViewGroup) promo.getParent()).removeView(promo);
                }
            },
            2000
        );
    }
}
