package com.musicbridge;

import android.content.Intent;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class ReactNativeHelperModule extends ReactContextBaseJavaModule {
    public ReactNativeHelperModule(@Nullable ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "ReactNativeHelper";
    }
    @ReactMethod
    void navigateToBrowser() {
        ReactApplicationContext context = getReactApplicationContext();
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage("com.pico.browser");
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(launchIntent);

    }
}
