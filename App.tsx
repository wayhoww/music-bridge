/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useState } from 'react';
import type { PropsWithChildren } from 'react';
import {
  Alert,
  Button,
  Linking,
  Modal,
  NativeModules,
  PermissionsAndroid,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  useColorScheme,
  View,
} from 'react-native';

import * as Progress from 'react-native-progress';

import {
  ExternalStorageDirectoryPath,
  DocumentDirectoryPath,
  downloadFile,
  mkdir
} from 'react-native-fs';

import { unzip, unzipAssets, subscribe } from 'react-native-zip-archive'

let DOMParser = require('react-native-html-parser').DOMParser;

class ParsedUrl {
  rawString: string;
  protocol: string;
  domain: string;
  path: string;

  constructor(rawString: string) {
    this.rawString = rawString;

    let endOfProtocol = this.rawString.indexOf('://');
    if (endOfProtocol < 0) {
      this.protocol = "";
      this.domain = "";
      this.path = "";
      return;
    }
    this.protocol = this.rawString.substring(0, endOfProtocol);

    let endOfDomain = this.rawString.indexOf('/', endOfProtocol + 3);
    if (endOfDomain < 0) {
      this.domain = this.rawString.substring(endOfProtocol + 3);
      this.path = "";
      return;
    }

    this.domain = this.rawString.substring(endOfProtocol + 3, endOfDomain);
    this.path = this.rawString.substring(endOfDomain + 1);
  }
};

async function fetchJSON(url: string) {
  let response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  let json = await response.json();

  return json;
}

type BeatSaverMapMetaData = {
  downloadUrl: string;
}

function parseBeatSaverMapMetaData(data: any) {
  let versions = data['versions'];
  let selectedVersion = versions[0];
  let downloadUrl = selectedVersion['downloadURL'];
  let metaData: BeatSaverMapMetaData = { downloadUrl: downloadUrl };
  return metaData;
}

async function requestStoragePermission() {
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
    {
      title: '存储空间权限',
      message:
        'Music Bridge 需要将曲谱写入到光之乐团的自定义歌曲文件夹中。',
      buttonNeutral: 'Ask Me Later',
      buttonNegative: 'Cancel',
      buttonPositive: 'OK',
    },
  );

  console.log(granted);
  return granted == PermissionsAndroid.RESULTS.GRANTED;
};

async function importBeatSaverMapToLightBand(mapId: string, folder: string = 'MusicBridge') {
  console.debug(`beatsaver map downloading: ${mapId}`);

  let json = await fetchJSON(`https://beatsaver.com/api/maps/id/${mapId}`);
  let url = parseBeatSaverMapMetaData(json).downloadUrl;

  let downloadedMapsPath = `${DocumentDirectoryPath}/downloaded/maps`;
  await mkdir(downloadedMapsPath);

  let path = `${downloadedMapsPath}/${mapId}.zip`;

  let downloadResult = await downloadFile({ fromUrl: url, toFile: path }).promise;
  if (downloadResult.statusCode != 200)
    throw new Error("Failed to download");

  let customMusicBasePath = `${ExternalStorageDirectoryPath}/Android/data/com.StarRiverVR.LightBand/files/CustomMusic`;
  let mapPath = `${customMusicBasePath}/${folder}/${mapId}`;

  await mkdir(mapPath);
  await unzip(path, mapPath);

  console.debug(`beatsaver map downloaded: ${mapId}`);
}

type BeatSaverPlaylistMetaData = {
  title: string,
  maps: string[]
}

async function parseBeatSaverPlaylistMetaData(json: any): Promise<BeatSaverPlaylistMetaData> {
  let title = json['playlistTitle'];
  let songsInfo = json['songs'];
  var maps: string[] = [];
  for (let song of songsInfo) {
    maps.push(song['key'])
  }
  return {
    title: title,
    maps: maps
  }
}

async function importBeatSaverPlaylistToLightBand(url: string, progressCallback: ((arg0: number) => any) | undefined = undefined) {
  console.debug(`beatsaver playlist downloading: ${url}`);
  let json = await fetchJSON(url);
  let meta = await parseBeatSaverPlaylistMetaData(json);
  var countDone = 0;
  for (let map of meta.maps) {
    await importBeatSaverMapToLightBand(map, meta.title);
    countDone += 1;
    if (progressCallback) progressCallback(countDone / meta.maps.length)
  }
  console.debug(`beatsaver playlist downloaded: ${url}`);
}

type ImportPlaylistWindowProps = {
  progress: number;
};

function ImportPlaylistWindow(props: ImportPlaylistWindowProps): JSX.Element {
  return (
    <SafeAreaView>
      <Text style={styles.title}>Import Playlist</Text>
      <Progress.Bar
        width={null}
        height={12}
        borderRadius={8}
        indeterminate={false}
        progress={props.progress}
      />
    </SafeAreaView>
  )
}

function ImportMapWindow(): JSX.Element {
  return (
    <SafeAreaView>
      <Text style={styles.title}>Import Map</Text>
      <Progress.Circle indeterminate={true} size={120} thickness={9} />
    </SafeAreaView>
  )
}

function HintWindow(): JSX.Element {
  return (
    <SafeAreaView>
      <Text style={styles.title}>Music Bridge</Text>
      <Text style={styles.content}>点击 BeatSavers 网站上的 One Click 按钮来导入歌曲或播放列表</Text>
      <View style={styles.button}>
        <Button title='打开 BeatSaver' onPress={() => { Linking.openURL('https://beatsaver.com/') }} />
      </View>
      <View style={styles.button}>
        <Button title='打开浏览器' onPress={() => {
          NativeModules.ReactNativeHelper.navigateToBrowser();
        }} />
      </View>

    </SafeAreaView>
  );
}

async function forwardInitialUrl(syncState: AppCriticalState, setState: (arg: AppState) => any) {
  let url = await Linking.getInitialURL();
  if (url == null) return;
  onLinking({ url: url }, syncState, setState);
}

function onLinking(event: { url: string }, syncState: AppCriticalState, setState: (arg: AppState) => any) {
  console.debug(`onLinking: url=${event.url}`)
  if (syncState.status != ApplicationStatus.Free) {
    console.debug(`app is busy: ${syncState.status}`);
    ToastAndroid.show("app is busy", 0.5);
    return;
  }

  let url = new ParsedUrl(event.url);

  let newStatus = url.protocol == 'beatsaver' ? ApplicationStatus.DownloadingBeatSaverMap : ApplicationStatus.DownloadingBeatSaverPlaylist;
  syncState.status = newStatus;

  async function download() {
    setState({ status: newStatus, progress: 0 })

    try {
      await requestStoragePermission();

      if (url.protocol == 'beatsaver') {
        await importBeatSaverMapToLightBand(url.domain);
      } else if (url.protocol == 'bsplaylist') {
        await importBeatSaverPlaylistToLightBand(url.path, (progress) => {
          setState({ status: newStatus, progress: progress })
        });
      } else {
        console.error(`invalid url: ${url}`)
      }
      ToastAndroid.show('下载完成', 0.5);
    } catch (error) {
      console.error('error: ', error);
      Alert.alert('错误', '没能成功下载')
      console.log('alert done')
    } finally {
      console.debug('download finalized');
      syncState.status = ApplicationStatus.Free;
      setState({ status: ApplicationStatus.Free, progress: 0 });
    }
  }

  download();
}

enum ApplicationStatus {
  Free,
  DownloadingBeatSaverPlaylist,
  DownloadingBeatSaverMap,
}

type AppCriticalState = {
  status: ApplicationStatus
}

type AppState = {
  status: ApplicationStatus,
  progress: number
}


var applicationIsInitialized: boolean = false;

function App(): JSX.Element {
  let [state, setState] = useState({
    status: ApplicationStatus.Free,
    progress: 0
  })

  let syncState: AppCriticalState = {
    status: state.status
  }

  if (!applicationIsInitialized) {
    applicationIsInitialized = true;
    Linking.addEventListener('url', (event) => onLinking(event, syncState, setState))
    forwardInitialUrl(syncState, setState);
  } else {
    console.debug('skip initialization')
  }

  return (
    <SafeAreaView style={styles.rootWindow}>
      {state.status == ApplicationStatus.Free && <HintWindow />}
      {state.status == ApplicationStatus.DownloadingBeatSaverPlaylist && <ImportPlaylistWindow progress={state.progress} />}
      {state.status == ApplicationStatus.DownloadingBeatSaverMap && <ImportMapWindow />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  rootWindow: {
    margin: 24
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  content: {
    fontSize: 16
  },
  button: {
    margin: 16
  }
});

export default App;
